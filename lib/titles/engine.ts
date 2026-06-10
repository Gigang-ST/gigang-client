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
import { insertNoti } from "@/lib/notifications/insert-noti";

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

  console.info("[title-engine] trigger:", ctx.trigger, "| allowedCondTypes:", [...allowedCondTypes]);
  console.info("[title-engine] 평가 대상 칭호:", titles.map(t => t.ttl_nm));

  if (titles.length === 0) return [];

  // 4. 현재 활성 보유 칭호 ID (vers=0, del_yn=false) — 중복 수여 방지 및 회수 대상 파악
  const { data: existing } = await db
    .from("mem_ttl_rel")
    .select("mem_ttl_id, ttl_id, vers")
    .eq("team_mem_id", ctx.teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false);

  const activeIds = new Set((existing ?? []).map((r) => r.ttl_id));


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

    // 활성 행은 항상 vers=0 — 회수 시 vers가 변경되므로 재지급 시 충돌 없이 INSERT 가능
    const { error } = await db.from("mem_ttl_rel").insert({
      team_id: ctx.teamId,
      team_mem_id: ctx.teamMemId,
      ttl_id: title.ttl_id,
      grnt_rsn_txt: `자동수여 (trigger=${ctx.trigger})`,
      is_prmy_yn: false,
      vers: 0,
      del_yn: false,
    });

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

/**
 * 팀 전체 멤버를 대상으로 auto 칭호를 일괄 재평가하고 부여/회수한다.
 *
 * DB 쿼리 수: 멤버·칭호 수에 무관하게 약 7번 고정.
 *   - loadMemberSnapshots: 3번 (team_mem_rel, rec_race_hist, mem_ttl_rel)
 *   - ttl_mst 조회: 1번
 *   - bulk UPDATE (회수): 1번
 *   - bulk UPSERT (부여): 1번
 */
export async function sweepEvaluateAndGrant(
  teamId: string,
  teamMemIds: string[],
): Promise<{ granted: number; revoked: number }> {
  if (teamMemIds.length === 0) return { granted: 0, revoked: 0 };

  const db = createAdminClient();

  // 1. 멤버 전체 스냅샷 로드
  const snapshots = await loadMemberSnapshots(db, teamId, teamMemIds);
  if (snapshots.size === 0) return { granted: 0, revoked: 0 };

  // 2. 팀의 auto 칭호 전체 조회 (1번 — 멤버 수와 무관)
  const { data: allTitles } = await db
    .from("ttl_mst")
    .select("ttl_id, ttl_nm, cond_rule_json")
    .eq("team_id", teamId)
    .eq("ttl_kind_enm", "auto")
    .eq("use_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  const titles = (allTitles as TtlMstRow[] ?? []).filter((t) => t.cond_rule_json != null);
  if (titles.length === 0) return { granted: 0, revoked: 0 };

  const allowedCondTypes = new Set<string>(TRIGGER_COND_MAP["manual_sweep"]);
  const snapshotsByMemId = new Map<string, MemberSnapshot>(
    [...snapshots.values()].map((s) => [s.teamMemId, s]),
  );

  type GrantRow = {
    team_id: string;
    team_mem_id: string;
    ttl_id: string;
    grnt_rsn_txt: string;
    is_prmy_yn: boolean;
    vers: number;
    del_yn: boolean;
  };

  const toGrant: GrantRow[] = [];

  // 3. 메모리 내 평가 — DB 쿼리 없음
  for (const snapshot of snapshots.values()) {
    const eligibleTitles = titles.filter((t) => {
      const rule = t.cond_rule_json as CondRule;
      if (!allowedCondTypes.has(rule.type)) return false;
      // manual_sweep에서 mileage_goal_achieved_months는 count=1(목표달성)만 평가
      // count=5(내돈내놔)는 mileage_batch 전용 — 월 마감 후에만 의미 있음
      if (rule.type === "mileage_goal_achieved_months" && rule.count !== 1) return false;
      return true;
    });

    // 부여: 미보유 칭호 조건 충족 → 부여 대상 수집
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
        grnt_rsn_txt: "자동수여 (trigger=manual_sweep)",
        is_prmy_yn: false,
        vers: 0,
        del_yn: false,
      });
    }
  }

  // 4. bulk 부여 — 활성 행은 항상 vers=0, 회수 시 vers 변경되므로 충돌 없이 INSERT 가능
  let granted = 0;
  if (toGrant.length > 0) {
    const { data, error } = await db
      .from("mem_ttl_rel")
      .insert(toGrant)
      .select("mem_ttl_id, team_mem_id, ttl_id");
    if (error) console.error("[sweep] bulk INSERT 실패", error);
    granted = data?.length ?? 0;
    console.info(`[sweep] 칭호 신규 부여 ${granted}건`);

    // 실제 부여된 행에 대해서만 알림 발송 (fire-and-forget)
    if (data && data.length > 0) {
      const titleNameMap = new Map(titles.map((t) => [t.ttl_id, t.ttl_nm]));
      Promise.all(
        data.map((row) => {
          const snap = snapshotsByMemId.get(row.team_mem_id);
          if (!snap?.memId) return Promise.resolve();
          return insertNoti({
            teamId,
            memId: snap.memId,
            notiTypeEnm: "ttl_grnt",
            notiNm: `'${titleNameMap.get(row.ttl_id) ?? "칭호"}' 칭호를 획득했습니다!`,
            refId: row.ttl_id,
            refTypeEnm: "ttl",
          });
        }),
      ).catch(console.error);
    }
  }

  return { granted, revoked: 0 };
}

/**
 * 마일리지런 월초 배치 전용 bulk 평가 엔진.
 * sweepEvaluateAndGrant와 동일한 스냅샷 기반 구조 — DB 쿼리 수 고정.
 *
 * @param teamId   팀 ID
 * @param teamMemIds 평가할 팀 멤버 ID 목록
 * @param baseMonth  기준 월 (YYYY-MM) — 월 고정 조건 평가에 사용
 */
export async function batchEvaluateAndGrant(
  teamId: string,
  teamMemIds: string[],
  baseMonth: string,
  evtId?: string,
): Promise<{ granted: number }> {
  if (teamMemIds.length === 0) return { granted: 0 };

  const db = createAdminClient();

  const snapshots = await loadMemberSnapshots(db, teamId, teamMemIds, evtId);
  if (snapshots.size === 0) return { granted: 0 };

  const { data: allTitles } = await db
    .from("ttl_mst")
    .select("ttl_id, ttl_nm, cond_rule_json")
    .eq("team_id", teamId)
    .eq("ttl_kind_enm", "auto")
    .eq("use_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  const titles = (allTitles as TtlMstRow[] ?? []).filter((t) => t.cond_rule_json != null);
  if (titles.length === 0) return { granted: 0 };

  const allowedCondTypes = new Set<string>(TRIGGER_COND_MAP["mileage_batch"]);
  const snapshotsByMemId = new Map<string, MemberSnapshot>(
    [...snapshots.values()].map((s) => [s.teamMemId, s]),
  );

  type GrantRow = {
    team_id: string;
    team_mem_id: string;
    ttl_id: string;
    grnt_rsn_txt: string;
    is_prmy_yn: boolean;
    vers: number;
    del_yn: boolean;
  };

  const toGrant: GrantRow[] = [];

  for (const snapshot of snapshots.values()) {
    const eligibleTitles = titles.filter((t) => {
      const rule = t.cond_rule_json as CondRule;
      return allowedCondTypes.has(rule.type);
    });

    for (const title of eligibleTitles) {
      if (snapshot.heldTitleIds.has(title.ttl_id)) continue;

      const passed = evaluateConditionFromSnapshot(
        title.cond_rule_json as CondRule,
        snapshot,
        snapshotsByMemId,
        baseMonth,
      );
      if (!passed) continue;

      toGrant.push({
        team_id: teamId,
        team_mem_id: snapshot.teamMemId,
        ttl_id: title.ttl_id,
        grnt_rsn_txt: `자동수여 (trigger=mileage_batch, base_month=${baseMonth})`,
        is_prmy_yn: false,
        vers: 0,
        del_yn: false,
      });
    }
  }

  let granted = 0;
  if (toGrant.length > 0) {
    const { data, error } = await db
      .from("mem_ttl_rel")
      .insert(toGrant)
      .select("mem_ttl_id, team_mem_id, ttl_id");
    if (error) console.error("[mileage_batch] bulk INSERT 실패", error);
    granted = data?.length ?? 0;
    console.info(`[mileage_batch] 칭호 신규 부여 ${granted}건 (base_month=${baseMonth})`);

    // 실제 부여된 행에 대해서만 알림 발송 (fire-and-forget)
    if (data && data.length > 0) {
      const titleNameMap = new Map(titles.map((t) => [t.ttl_id, t.ttl_nm]));
      const snapByTeamMemId = new Map([...snapshots.entries()]);
      Promise.all(
        data.map((row) => {
          const snap = snapByTeamMemId.get(row.team_mem_id);
          if (!snap?.memId) return Promise.resolve();
          return insertNoti({
            teamId,
            memId: snap.memId,
            notiTypeEnm: "ttl_grnt",
            notiNm: `'${titleNameMap.get(row.ttl_id) ?? "칭호"}' 칭호를 획득했습니다!`,
            refId: row.ttl_id,
            refTypeEnm: "ttl",
          });
        }),
      ).catch(console.error);
    }
  }

  return { granted };
}
