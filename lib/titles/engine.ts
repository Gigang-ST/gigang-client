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

/** 이번 배치가 실제로 부여한 칭호 한 건 — 실행 이력 화면이 "누가 무엇을 받았는지"에 쓴다. */
export type BatchGrant = { memId: string; ttlNm: string };

export type BatchGrantOutcome = {
  granted: number;
  /**
   * 부여 내역. **`granted`와 길이가 다를 수 있다** — 스냅샷에 `memId`가 없는 행은 여기서
   * 빠진다(부여는 됐고 알림만 못 가는 경우). 건수의 정본은 `granted`다.
   */
  grants: BatchGrant[];
};

type TtlMstRow = {
  ttl_id: string;
  ttl_nm: string;
  cond_rule_json: unknown;
  /**
   * 적용 시작일(KST). 이 날짜부터 발생한 활동만 센다. **null이면 소급 제한 없음** —
   * 기존 64종은 전부 null이라 동작이 그대로다(설계 §7.5).
   */
  eff_stt_dt?: string | null;
};

/**
 * 팀의 사용 중인 auto 칭호 전체.
 *
 * 배치는 **루프 밖에서 한 번** 불러 `evaluateAndGrantTitles`에 넘긴다 — 멤버마다 부르면
 * 같은 조회가 멤버 수만큼 반복된다.
 */
export async function loadAutoTitles(
  db: ReturnType<typeof createAdminClient>,
  teamId: string,
): Promise<TtlMstRow[]> {
  const { data, error } = await db
    .from("ttl_mst")
    .select("ttl_id, ttl_nm, cond_rule_json, eff_stt_dt")
    .eq("team_id", teamId)
    .eq("ttl_kind_enm", "auto")
    .eq("use_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  // ⚠️ **조회 실패를 빈 배열로 넘기지 않는다.** 넘기면 "평가할 칭호 0건"이 되어 배치가
  // **아무것도 안 하고 성공**으로 끝난다 — 실행 이력에도 흔적이 안 남아 며칠 뒤에야
  // "왜 칭호가 안 붙지"로 발견된다. 실시간 훅에서 던져도 호출부가 `.catch()`로 로깅한다.
  if (error) throw new Error(`칭호 목록 조회 실패: ${error.message}`);
  return (data as TtlMstRow[]) ?? [];
}

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
  /**
   * 팀의 auto 칭호 목록. **배치가 미리 한 번 읽어 넘긴다.**
   *
   * 안 넘기면 이 함수가 직접 조회하는데, 배치가 멤버마다 부르면 **멤버 수만큼 같은
   * `ttl_mst` 전체 조회**가 나간다(200명이면 200번). 실시간 트리거는 한 번만 부르므로
   * 그대로 두면 된다.
   */
  preloadedTitles?: TtlMstRow[],
  /**
   * 조회 캐시. **배치는 실행 1회짜리 캐시를 만들어 모든 멤버에 공유한다.**
   *
   * 캐시 키가 `memId`를 포함하는 것(참석·취소·글·댓글)은 공유해도 멤버당 1번 그대로지만,
   * **팀 공통 조회**(그 달 팀 모임 수, 팀 댓글 1위, 응원 원장)는 200번이 1번이 된다 —
   * 월 배치가 20초 걸린 주범이었다.
   *
   * 안 넘기면 멤버마다 새로 만든다(실시간 트리거는 어차피 한 번만 부르므로 그게 맞다).
   */
  sharedCache?: Map<string, unknown>,
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
  //    (배치가 미리 읽어 넘겼으면 그걸 쓴다 — 멤버마다 같은 조회를 반복하지 않는다)
  const allTitles = preloadedTitles ?? (await loadAutoTitles(db, ctx.teamId));

  const titles = (allTitles as TtlMstRow[] ?? []).filter((t) => {
    const rule = t.cond_rule_json as CondRule | null;
    return rule && allowedCondTypes.has(rule.type);
  });

  console.info("[title-engine] trigger:", ctx.trigger, "| allowedCondTypes:", [...allowedCondTypes]);
  console.info("[title-engine] 평가 대상 칭호:", titles.map(t => t.ttl_nm));

  if (titles.length === 0) return [];

  // 4. 현재 활성 보유 칭호 ID (vers=0, del_yn=false) — 중복 수여 방지
  const { data: existing } = await db
    .from("mem_ttl_rel")
    .select("ttl_id")
    .eq("team_mem_id", ctx.teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false);

  const activeIds = new Set((existing ?? []).map((r) => r.ttl_id));

  // 대표 칭호는 **여기서 정하지 않는다.** 새로 받은 칭호를 대표로 세우는 일은 DB 트리거
  // (`trg_mem_ttl_rel_promote_latest_primary`)가 INSERT마다 대신한다 — 수여 경로가 넷이라
  // (여기 · sweep · 마일리지 배치 · 관리자 수동수여) 앱에서 각자 처리하면 새 경로를
  // 추가할 때마다 조용히 빠진다(기강 포인트 적립을 원천 테이블 트리거로 두는 것과 같은 이유).
  //
  // 예전엔 여기서 "대표가 비어 있을 때만 첫 수여분을 대표로" 세우고, 동시 실행으로 대표
  // 자리를 뺏기면(23505) 대표 표시를 떼고 재삽입하는 보정까지 했다. 트리거가 해제 →
  // 승격을 한 트랜잭션에서 처리하므로 그 경쟁 자체가 사라졌다.

  // 5. 조건 평가 → 통과한 미보유 칭호 수여
  const granted: string[] = [];

  // 조건들이 나눠 쓰는 조회 캐시. 배치가 넘겨줬으면 그걸 쓴다(팀 공통 조회가 1번이 된다).
  // 모임 칭호 6종이 전부 같은 참석 목록을 보므로, 없으면 같은 쿼리가 6번 나간다.
  const evalCache = sharedCache ?? new Map<string, unknown>();

  for (const title of titles) {
    if (activeIds.has(title.ttl_id)) continue; // 현재 활성 보유 중이면 스킵

    let passed = false;
    try {
      passed = await evaluateCondition(
        title.cond_rule_json as CondRule,
        ctx,
        memId,
        db,
        // 적용 시작일 — 이 날짜부터 발생한 활동만 센다. 기존 64종은 null이라 그대로 소급된다.
        title.eff_stt_dt ?? null,
        evalCache,
      );
    } catch (e) {
      console.error(`[title-engine] 조건 평가 실패 ttl_id=${title.ttl_id}`, e);
      continue;
    }

    if (!passed) continue;

    // 활성 행은 항상 vers=0 — 회수 시 vers가 변경되므로 재지급 시 충돌 없이 INSERT 가능.
    // `is_prmy_yn`은 넘기지 않는다(기본 false) — 대표 승격은 INSERT 직후 트리거가 한다(§4).
    const { error } = await db.from("mem_ttl_rel").insert({
      team_id: ctx.teamId,
      team_mem_id: ctx.teamMemId,
      ttl_id: title.ttl_id,
      grnt_rsn_txt: `자동수여 (trigger=${ctx.trigger})`,
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
 * 팀 전체 멤버를 대상으로 auto 칭호를 일괄 재평가하고 **부여한다**.
 *
 * ⚠️ **이 엔진은 부여 전용이다 — 회수하지 않는다.** 예전 주석·반환값(`revoked`)은 회수를
 * 하는 것처럼 적혀 있었지만 그 코드는 처음부터 없었고, 화면엔 늘 "자동 회수 0개"가 찍혀
 * 없는 기능이 정상 동작하는 것처럼 보였다. 2026-08-14에 걷어냈다.
 *
 * 회수는 **관리자 수동**(`app/actions/admin/revoke-title.ts`의 `revokeTitle`)이 유일한 경로다.
 * 자동 회수를 넣지 않는 건 정책이다(회비 감면 설계 §6.4와 같은 태도):
 *   - 운영진이 노쇼를 정리하는 순간 이미 준 칭호가 걷힌다
 *   - 회수 알림이 없어 사용자는 칭호가 사라진 것만 알게 된다
 *   - 참석 계열에 3일 유예를 둔 것부터가 "회수할 일을 안 만들려고"였다
 *
 * DB 쿼리 수: 멤버·칭호 수에 무관하게 약 5번 고정.
 *   - loadMemberSnapshots: 3번 (team_mem_rel, rec_race_hist, mem_ttl_rel)
 *   - ttl_mst 조회: 1번
 *   - bulk INSERT (부여): 1번
 */
export async function sweepEvaluateAndGrant(
  teamId: string,
  teamMemIds: string[],
): Promise<{ granted: number }> {
  if (teamMemIds.length === 0) return { granted: 0 };

  const db = createAdminClient();

  // 1. 멤버 전체 스냅샷 로드
  const snapshots = await loadMemberSnapshots(db, teamId, teamMemIds);
  if (snapshots.size === 0) return { granted: 0 };

  // 2. 팀의 auto 칭호 전체 조회 (1번 — 멤버 수와 무관)
  const { data: allTitles } = await db
    .from("ttl_mst")
    .select("ttl_id, ttl_nm, cond_rule_json, eff_stt_dt")
    .eq("team_id", teamId)
    .eq("ttl_kind_enm", "auto")
    .eq("use_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  const titles = (allTitles as TtlMstRow[] ?? []).filter((t) => t.cond_rule_json != null);
  if (titles.length === 0) return { granted: 0 };

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
        undefined,
        // 적용 시작일 — sweep이라고 과거를 소급하면 안 된다(§7.5).
        title.eff_stt_dt ?? null,
      );
      if (!passed) continue;

      toGrant.push({
        team_id: teamId,
        team_mem_id: snapshot.teamMemId,
        ttl_id: title.ttl_id,
        grnt_rsn_txt: "자동수여 (trigger=manual_sweep)",
        // false로 넣어도 INSERT 직후 트리거가 대표로 승격한다
        // (`trg_mem_ttl_rel_promote_latest_primary`). 한 사람이 한 번에 여러 개를 받으면
        // 그중 마지막 행이 대표로 남는다 — 어느 걸 내걸지는 본인이 다시 고르면 된다.
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

  return { granted };
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
): Promise<BatchGrantOutcome> {
  if (teamMemIds.length === 0) return { granted: 0, grants: [] };

  const db = createAdminClient();

  const snapshots = await loadMemberSnapshots(db, teamId, teamMemIds, evtId);
  if (snapshots.size === 0) return { granted: 0, grants: [] };

  const { data: allTitles } = await db
    .from("ttl_mst")
    .select("ttl_id, ttl_nm, cond_rule_json, eff_stt_dt")
    .eq("team_id", teamId)
    .eq("ttl_kind_enm", "auto")
    .eq("use_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  const titles = (allTitles as TtlMstRow[] ?? []).filter((t) => t.cond_rule_json != null);
  if (titles.length === 0) return { granted: 0, grants: [] };

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
        title.eff_stt_dt ?? null,
      );
      if (!passed) continue;

      toGrant.push({
        team_id: teamId,
        team_mem_id: snapshot.teamMemId,
        ttl_id: title.ttl_id,
        grnt_rsn_txt: `자동수여 (trigger=mileage_batch, base_month=${baseMonth})`,
        // 대표 승격은 트리거가 한다(§sweepEvaluateAndGrant의 같은 주석).
        is_prmy_yn: false,
        vers: 0,
        del_yn: false,
      });
    }
  }

  let granted = 0;
  const grants: BatchGrant[] = [];
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

      // 부여 내역을 호출부(배치)에 돌려준다 — 실행 이력 화면이 "누가 무슨 칭호를 받았는지"를
      // 보여주려면 이 정보가 필요하다. 알림에 쓰려고 이미 만들어 둔 맵을 그대로 재사용한다.
      for (const row of data) {
        const snap = snapByTeamMemId.get(row.team_mem_id);
        if (!snap?.memId) continue;
        grants.push({ memId: snap.memId, ttlNm: titleNameMap.get(row.ttl_id) ?? "칭호" });
      }

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

  return { granted, grants };
}
