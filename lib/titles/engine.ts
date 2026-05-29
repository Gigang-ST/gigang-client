/**
 * 칭호 자동 부여 핵심 엔진
 *
 * evaluateAndGrantTitles(ctx) 하나만 공개한다.
 * 모든 트리거(기록 저장, 마일리지런, 출석, 관리자 일괄)에서 이 함수만 호출한다.
 *
 * 흐름:
 *   1. TRIGGER_COND_MAP 에서 이 트리거가 평가할 조건 유형 목록을 가져온다.
 *   2. team_mem_id → mem_id 변환 (rec_race_hist 등 레거시 스키마가 mem_id 기반)
 *   3. 이 팀의 auto 칭호 전체 조회 후 허용된 조건 유형만 필터링
 *   4. 이미 보유한 칭호 ID 목록 조회 (중복 수여 방지)
 *   5. 각 칭호의 cond_rule_json 평가 → 통과 & 미보유 칭호를 mem_ttl_rel 에 INSERT
 */

import { createAdminClient } from "@/lib/supabase/admin";

import { evaluateCondition, evaluateConditionFromSnapshot } from "./evaluators";
import { loadMemberSnapshots } from "./snapshot";
import { TRIGGER_COND_MAP } from "./types";

import type { CondRule, TitleEvalContext } from "./types";
import type { MemberSnapshot } from "./snapshot";

type TtlMstRow = {
  ttl_id: string;
  ttl_nm: string;
  cond_rule_json: unknown;
};

/**
 * 주어진 컨텍스트 기준으로 자동 칭호를 평가하고, 조건을 충족하는 미보유 칭호를 부여한다.
 *
 * - service_role 클라이언트를 사용하므로 RLS를 우회한다.
 * - 기록 저장 등의 액션에서 fire-and-forget 방식(.catch())으로 호출한다.
 *   칭호 부여 실패가 본 액션(기록 저장 등)을 롤백시키지 않아야 하기 때문이다.
 *
 * @returns 새로 부여된 칭호명 목록 (로그/알림 목적)
 */
export async function evaluateAndGrantTitles(
  ctx: TitleEvalContext,
): Promise<string[]> {
  const db = createAdminClient();

  // 1. 이 트리거에서 평가할 조건 유형 목록
  const allowedCondTypes = new Set(TRIGGER_COND_MAP[ctx.trigger]);

  // 2. team_mem_id → mem_id 변환
  //    rec_race_hist 등 레거시 테이블이 mem_mst.mem_id 를 직접 참조하므로 필요하다.
  const { data: relRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", ctx.teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (!relRow?.mem_id) return [];
  const memId = relRow.mem_id;

  // 3. 이 팀의 사용 중인 auto 칭호 전체 조회 후 이 트리거에서 평가할 조건 유형만 필터링
  const { data: allTitles } = await db
    .from("ttl_mst")
    .select("ttl_id, ttl_nm, cond_rule_json")
    .eq("team_id", ctx.teamId)
    .eq("ttl_kind_enm", "auto")
    .eq("use_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  const titles = (allTitles as TtlMstRow[] ?? []).filter((t) => {
    const rule = t.cond_rule_json as CondRule | null;
    return rule && allowedCondTypes.has(rule.type);
  });

  if (titles.length === 0) return [];

  // 4. 현재 활성 보유 칭호 ID (vers=0, del_yn=false) — 중복 수여 방지 및 회수 대상 파악
  const { data: existing } = await db
    .from("mem_ttl_rel")
    .select("mem_ttl_id, ttl_id, vers")
    .eq("team_mem_id", ctx.teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false);

  const activeIds = new Set((existing ?? []).map((r) => r.ttl_id));

  // 4-1. manual_sweep 전용: 보유 중인 auto 칭호 조건 재평가 → 미충족 시 자동 회수
  //      트리거마다 회수를 실행하면 과부하이므로 일괄 재계산 시에만 수행한다.
  if (ctx.trigger === "manual_sweep") {
    const autoTitleIds = new Set(titles.map((t) => t.ttl_id));

    for (const held of existing ?? []) {
      if (!autoTitleIds.has(held.ttl_id)) continue; // auto 칭호가 아니면 회수 대상 제외

      const title = titles.find((t) => t.ttl_id === held.ttl_id);
      if (!title) continue;

      let passed = false;
      try {
        passed = await evaluateCondition(title.cond_rule_json as CondRule, ctx, memId, db);
      } catch (e) {
        console.error(`[title-engine] 회수 평가 실패 ttl_id=${held.ttl_id}`, e);
        continue;
      }

      if (!passed) {
        // 현재 최대 vers를 기준으로 다음 vers 계산 — 재부여/재회수 반복 시 충돌 방지
        const { data: maxVersRow } = await db
          .from("mem_ttl_rel")
          .select("vers")
          .eq("team_mem_id", ctx.teamMemId)
          .eq("ttl_id", held.ttl_id)
          .order("vers", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVers = (maxVersRow?.vers ?? 0) + 1;

        const { error } = await db
          .from("mem_ttl_rel")
          .update({ del_yn: true, vers: nextVers })
          .eq("mem_ttl_id", held.mem_ttl_id)
          .eq("vers", held.vers)
          .eq("del_yn", false);

        if (!error) {
          activeIds.delete(held.ttl_id); // 회수 완료 → 재부여 대상으로 재평가 가능
          console.info(`[title-engine] 칭호 자동 회수: ttl_id=${held.ttl_id} → team_mem_id=${ctx.teamMemId}`);
        }
      }
    }
  }

  // 5. 조건 평가 → 통과한 미보유 칭호 수여
  const granted: string[] = [];

  for (const title of titles) {
    if (activeIds.has(title.ttl_id)) continue; // 현재 활성 보유 중이면 스킵

    let passed = false;
    try {
      passed = await evaluateCondition(
        title.cond_rule_json as CondRule,
        ctx,
        memId,
        db,
      );
    } catch (e) {
      console.error(`[title-engine] 조건 평가 실패 ttl_id=${title.ttl_id}`, e);
      continue;
    }

    if (!passed) continue;

    // uk_mem_ttl_rel_team_mem_ttl_vers: UNIQUE(team_mem_id, ttl_id, vers)
    // vers=0으로 INSERT — 이미 활성 보유 중이면 충돌 무시 (동시 호출 중복 수여 방지)
    const { error } = await db.from("mem_ttl_rel").upsert({
      team_id: ctx.teamId,
      team_mem_id: ctx.teamMemId,
      ttl_id: title.ttl_id,
      grnt_rsn_txt: `자동수여 (trigger=${ctx.trigger})`,
      is_prmy_yn: false,
      vers: 0,
      del_yn: false,
    }, { onConflict: "team_mem_id,ttl_id,vers", ignoreDuplicates: true });

    if (error) {
      console.error(`[title-engine] 칭호 부여 실패 ttl_id=${title.ttl_id}`, error);
      continue;
    }

    granted.push(title.ttl_nm);
    console.info(`[title-engine] 칭호 부여 완료: ${title.ttl_nm} → team_mem_id=${ctx.teamMemId}`);
  }

  return granted;
}

// ---------------------------------------------------------------------------
// bulk sweep 전용 엔진 — sweepAllTitles() 에서만 호출
// ---------------------------------------------------------------------------

type SweepResult = {
  granted: number;
  revoked: number;
};

/**
 * 팀 전체 멤버를 대상으로 auto 칭호를 일괄 재평가하고 부여/회수한다.
 *
 * DB 쿼리 수: 멤버·칭호 수에 무관하게 약 7번 고정.
 *   - loadMemberSnapshots: 4번 (team_mem_rel, rec_race_hist, mem_ttl_rel)
 *   - ttl_mst 조회: 1번
 *   - bulk UPDATE (회수): 1번
 *   - bulk UPSERT (부여): 1번
 */
export async function sweepEvaluateAndGrant(
  teamId: string,
  teamMemIds: string[],
): Promise<SweepResult> {
  if (teamMemIds.length === 0) return { granted: 0, revoked: 0 };

  const db = createAdminClient();

  // 1. 멤버 전체 스냅샷 로드 (DB 쿼리 4번)
  const snapshots = await loadMemberSnapshots(db, teamId, teamMemIds);
  if (snapshots.size === 0) return { granted: 0, revoked: 0 };

  // 2. 팀의 auto 칭호 전체 조회 (1번 — 멤버 수와 무관)
  const { data: allTitles } = await db
    .from("ttl_mst")
    .select("ttl_id, ttl_nm, base_pt, cond_rule_json")
    .eq("team_id", teamId)
    .eq("ttl_kind_enm", "auto")
    .eq("use_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  const titles = (allTitles as TtlMstRow[] ?? []).filter((t) => t.cond_rule_json != null);
  if (titles.length === 0) return { granted: 0, revoked: 0 };

  const autoTitleIds = new Set(titles.map((t) => t.ttl_id));
  const allowedCondTypes = new Set(TRIGGER_COND_MAP["manual_sweep"]);

  // race_pb_faster_than_member 평가 시 타 멤버 데이터 참조를 위해 MemberSnapshot 맵을 전달
  const snapshotsByMemId = new Map<string, MemberSnapshot>(
    [...snapshots.values()].map((s) => [s.teamMemId, s]),
  );

  // 3. 메모리 내 평가 — DB 쿼리 없음
  type GrantRow = {
    team_id: string;
    team_mem_id: string;
    ttl_id: string;
    grnt_pt: number;
    aply_pt: number;
    pt_chg_rsn_cd: string;
    grnt_rsn_txt: string;
    is_prmy_yn: boolean;
    vers: number;
    del_yn: boolean;
  };

  const toRevoke: { mem_ttl_id: string; vers: number }[] = [];
  const toGrant: GrantRow[] = [];

  for (const snapshot of snapshots.values()) {
    const eligibleTitles = titles.filter((t) => {
      const rule = t.cond_rule_json as CondRule;
      return allowedCondTypes.has(rule.type);
    });

    // 3-1. 회수 평가: 보유 중인 auto 칭호 중 조건 미충족 → 회수 대상 수집
    for (const held of snapshot.heldRows) {
      if (!autoTitleIds.has(held.ttl_id)) continue;
      const title = eligibleTitles.find((t) => t.ttl_id === held.ttl_id);
      if (!title) continue;

      const passed = evaluateConditionFromSnapshot(
        title.cond_rule_json as CondRule,
        snapshot,
        snapshotsByMemId,
      );
      if (!passed) {
        toRevoke.push({ mem_ttl_id: held.mem_ttl_id, vers: held.vers });
        snapshot.heldTitleIds.delete(held.ttl_id);
      }
    }

    // 3-2. 부여 평가: 미보유 칭호 중 조건 충족 → 부여 대상 수집
    for (const title of eligibleTitles) {
      if (snapshot.heldTitleIds.has(title.ttl_id)) continue;

      const passed = evaluateConditionFromSnapshot(
        title.cond_rule_json as CondRule,
        snapshot,
        snapshotsByMemId,
      );
      if (!passed) continue;

      toGrant.push({
        team_id: teamId,
        team_mem_id: snapshot.teamMemId,
        ttl_id: title.ttl_id,
        grnt_pt: title.base_pt,
        aply_pt: title.base_pt,
        pt_chg_rsn_cd: "initial_grant",
        grnt_rsn_txt: "자동수여 (trigger=manual_sweep)",
        is_prmy_yn: false,
        vers: 0,
        del_yn: false,
      });
    }
  }

  // 4. bulk 회수 — 회수 대상을 한 번에 UPDATE
  if (toRevoke.length > 0) {
    const revokeIds = toRevoke.map((r) => r.mem_ttl_id);
    await db
      .from("mem_ttl_rel")
      .update({ del_yn: true, pt_chg_rsn_cd: "auto_revoke" })
      .in("mem_ttl_id", revokeIds)
      .eq("del_yn", false);
    console.info(`[sweep] 칭호 자동 회수 ${toRevoke.length}건`);
  }

  // 5. bulk 부여 — 부여 대상을 한 번에 UPSERT
  if (toGrant.length > 0) {
    await db
      .from("mem_ttl_rel")
      .upsert(toGrant, { onConflict: "team_mem_id,ttl_id,vers", ignoreDuplicates: true });
    console.info(`[sweep] 칭호 신규 부여 ${toGrant.length}건`);
  }

  return { granted: toGrant.length, revoked: toRevoke.length };
}
