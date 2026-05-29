/**
 * 칭호 조건 평가 함수 모음
 *
 * 각 함수는 순수하게 "이 멤버가 이 조건을 충족하는가?" 만 판단한다.
 * DB 조회만 하고 INSERT/UPDATE는 하지 않는다.
 * ctx(트리거 컨텍스트)에 의존하지 않는다 — 트리거 필터링은 engine.ts 의 TRIGGER_COND_MAP 이 담당한다.
 *
 * 새 CondRule 타입을 추가하면 evaluateCondition() switch 에 케이스를 추가한다.
 */

import type { Database } from "@/lib/supabase/database.types";

import type {
  CondRule,
  TitleEvalContext,
  CondRacePersonalBestUnderSec,
  CondRaceFinishCount,
  CondMileageRunComplete,
  CondAttendanceCount,
  CondMembershipDays,
  CondRacePbFasterThanMember,
  CondJoinedOnDate,
  CondRaceFinishInMonthRange,
  CondRaceFinishAllTitles,
  CondRaceFinishAllOf,
  CondRaceFinishTotal,
  CondRaceFinishInYear,
  CondRaceRankByGender,
  CondRaceRankLast,
  CondRacePbWithinSecOfTarget,
  CondHasTitleInCategories,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// 개별 조건 평가 함수 (engine.ts 에서 team_mem_id → mem_id 변환 후 호출)
// ---------------------------------------------------------------------------

export async function evalRacePbUnderSecInternal(
  rule: CondRacePersonalBestUnderSec,
  memId: string,
  db: DB,
): Promise<boolean> {
  // sport_ctgr 조건을 limit(1) 이전에 쿼리 레벨에서 적용해 올바른 PB를 조회
  let query = db
    .from("rec_race_hist")
    .select("rec_time_sec, comp_evt_cfg!inner(comp_evt_type), comp_mst!inner(comp_sprt_cd)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("comp_evt_cfg.comp_evt_type", rule.sport.toUpperCase());

  if (rule.sport_ctgr) {
    query = query.eq("comp_mst.comp_sprt_cd", rule.sport_ctgr);
  }

  const { data } = await query.order("rec_time_sec", { ascending: true }).limit(1);

  if (!data || data.length === 0) return false;
  return data[0].rec_time_sec <= rule.sec;
}

export async function evalRaceFinishCountInternal(
  rule: CondRaceFinishCount,
  memId: string,
  db: DB,
): Promise<boolean> {
  // rec_race_hist.comp_id → comp_mst (평행 조인, 중첩 아님)
  // rec_race_hist.comp_evt_id → comp_evt_cfg
  const { data } = await db
    .from("rec_race_hist")
    .select("race_result_id, comp_evt_cfg!inner(comp_evt_type), comp_mst!inner(comp_sprt_cd)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  if (!data) return false;

  const matchCount = data.filter((row) => {
    const evtCfg = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
    const evtType = (evtCfg as { comp_evt_type?: string } | null)?.comp_evt_type?.toUpperCase() ?? "";
    const mst = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
    const sprtCd = (mst as { comp_sprt_cd?: string } | null)?.comp_sprt_cd ?? null;

    const typeMatch = !rule.sport || evtType === rule.sport.toUpperCase();
    const ctgrMatch = !rule.sport_ctgr || sprtCd === rule.sport_ctgr;
    return typeMatch && ctgrMatch;
  }).length;

  return matchCount >= rule.count;
}

export async function evalMileageRunCompleteInternal(
  rule: CondMileageRunComplete,
  teamMemId: string,
  db: DB,
): Promise<boolean> {
  // TODO: 마일리지런 완주 판정 로직은 실제 스키마 확정 후 구현한다.
  // 현재 evt_team_prt_rel, evt_mlg_act_hist 등 테이블 구조 파악이 필요하다.
  // 참고: app/actions/mileage-run.ts
  void rule; void teamMemId; void db;
  return false;
}

export async function evalAttendanceCountInternal(
  rule: CondAttendanceCount,
  memId: string,
  db: DB,
): Promise<boolean> {
  // 기록 등록 횟수를 출석 지표로 사용한다.
  // 추후 별도 출석 테이블이 생기면 이 함수만 교체하면 된다.
  const { count } = await db
    .from("rec_race_hist")
    .select("*", { count: "exact", head: true })
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  return (count ?? 0) >= rule.count;
}

export async function evalMembershipDaysInternal(
  rule: CondMembershipDays,
  teamMemId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("team_mem_rel")
    .select("join_dt")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (!data?.join_dt) return false;

  const joinDate = new Date(data.join_dt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= rule.days;
}

export async function evalRacePbFasterThanMemberInternal(
  rule: CondRacePbFasterThanMember,
  memId: string,
  db: DB,
): Promise<boolean> {
  // 본인이 비교 대상이면 항상 false
  if (memId === rule.target_mem_id) return false;

  const sport = rule.sport.toUpperCase();

  const [{ data: targetData }, { data: myData }] = await Promise.all([
    db
      .from("rec_race_hist")
      .select("rec_time_sec, comp_evt_cfg!inner(comp_evt_type)")
      .eq("mem_id", rule.target_mem_id)
      .eq("del_yn", false)
      .eq("vers", 0)
      .eq("comp_evt_cfg.comp_evt_type", sport)
      .order("rec_time_sec", { ascending: true })
      .limit(1),
    db
      .from("rec_race_hist")
      .select("rec_time_sec, comp_evt_cfg!inner(comp_evt_type)")
      .eq("mem_id", memId)
      .eq("del_yn", false)
      .eq("vers", 0)
      .eq("comp_evt_cfg.comp_evt_type", sport)
      .order("rec_time_sec", { ascending: true })
      .limit(1),
  ]);

  if (!targetData?.[0] || !myData?.[0]) return false;
  return myData[0].rec_time_sec < targetData[0].rec_time_sec;
}

/** 특정 날짜(월/일)에 가입한 경우 */
export async function evalJoinedOnDateInternal(
  rule: CondJoinedOnDate,
  teamMemId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("team_mem_rel")
    .select("join_dt")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (!data?.join_dt) return false;

  const joinDate = new Date(data.join_dt);
  return joinDate.getMonth() + 1 === rule.month && joinDate.getDate() === rule.day;
}

/** 특정 월 범위 내에 대회를 완주한 적 있는 경우 */
export async function evalRaceFinishInMonthRangeInternal(
  rule: CondRaceFinishInMonthRange,
  memId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("rec_race_hist")
    .select("race_result_id, comp_mst!inner(comp_date, comp_sprt_cd), comp_evt_cfg!inner(comp_evt_type)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  if (!data) return false;

  return data.some((row) => {
    const mst = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
    const compDate = (mst as { comp_date?: string; comp_sprt_cd?: string } | null)?.comp_date;
    const sprtCd = (mst as { comp_sprt_cd?: string } | null)?.comp_sprt_cd ?? null;
    const evtCfg = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
    const evtType = (evtCfg as { comp_evt_type?: string } | null)?.comp_evt_type?.toUpperCase() ?? "";

    if (!compDate) return false;
    const month = new Date(compDate).getMonth() + 1;
    const monthMatch = rule.months.includes(month);
    const typeMatch = !rule.sport || evtType === rule.sport.toUpperCase();
    const ctgrMatch = !rule.sport_ctgr || sprtCd === rule.sport_ctgr;
    return monthMatch && typeMatch && ctgrMatch;
  });
}

/** 지정한 칭호명 목록을 모두 보유한 경우 (예: 사계절) */
export async function evalRaceFinishAllTitlesInternal(
  rule: CondRaceFinishAllTitles,
  teamMemId: string,
  teamId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("mem_ttl_rel")
    .select("ttl_mst!inner(ttl_nm)")
    .eq("team_mem_id", teamMemId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (!data) return false;

  const heldNames = new Set(
    data.map((row) => {
      const mst = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
      return (mst as { ttl_nm?: string } | null)?.ttl_nm ?? "";
    }),
  );

  return rule.ttl_nms.every((nm) => heldNames.has(nm));
}

/** 복수 종목을 모두 N회 이상 완주한 경우 (예: 멀티러너) */
export async function evalRaceFinishAllOfInternal(
  rule: CondRaceFinishAllOf,
  memId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("rec_race_hist")
    .select("race_result_id, comp_evt_cfg!inner(comp_evt_type), comp_mst!inner(comp_sprt_cd)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  if (!data) return false;

  return rule.sports.every((sport) => {
    const count = data.filter((row) => {
      const evtCfg = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
      const evtType = (evtCfg as { comp_evt_type?: string } | null)?.comp_evt_type?.toUpperCase() ?? "";
      const mst = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
      const sprtCd = (mst as { comp_sprt_cd?: string } | null)?.comp_sprt_cd ?? null;
      const ctgrMatch = !rule.sport_ctgr || sprtCd === rule.sport_ctgr;
      return evtType === sport.toUpperCase() && ctgrMatch;
    }).length;
    return count >= rule.count;
  });
}

/** 종목 무관 전체 완주 횟수가 N회 이상인 경우 (예: 대회왕) */
export async function evalRaceFinishTotalInternal(
  rule: CondRaceFinishTotal,
  memId: string,
  db: DB,
): Promise<boolean> {
  const { count } = await db
    .from("rec_race_hist")
    .select("*", { count: "exact", head: true })
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  return (count ?? 0) >= rule.count;
}

/** 한 해(연도) 내 완주 횟수가 N회 이상인 경우 (예: 시즌러너, 돈을 달린다) */
export async function evalRaceFinishInYearInternal(
  rule: CondRaceFinishInYear,
  memId: string,
  db: DB,
): Promise<boolean> {
  const year = rule.year ?? new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data } = await db
    .from("rec_race_hist")
    .select("race_result_id, comp_mst!inner(comp_date)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  if (!data) return false;

  const count = data.filter((row) => {
    const mst = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
    const compDate = (mst as { comp_date?: string } | null)?.comp_date ?? "";
    return compDate >= from && compDate <= to;
  }).length;

  return count >= rule.count;
}

/**
 * 팀 내 성별 종목 PB 순위가 N위인 경우 (예: 기강1황, Queen, 하프킹, 단거리왕, 山神)
 * gender="any": 남녀 각각 해당 순위이면 true
 */
export async function evalRaceRankByGenderInternal(
  rule: CondRaceRankByGender,
  memId: string,
  teamId: string,
  db: DB,
): Promise<boolean> {
  const sport = rule.sport.toUpperCase();

  // 팀 전체 멤버의 해당 종목 PB 조회
  let query = db
    .from("rec_race_hist")
    .select("mem_id, rec_time_sec, comp_evt_cfg!inner(comp_evt_type), comp_mst!inner(comp_sprt_cd), mem_mst!inner(gdr_enm)")
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("comp_evt_cfg.comp_evt_type", sport);

  if (rule.sport_ctgr) {
    query = query.eq("comp_mst.comp_sprt_cd", rule.sport_ctgr);
  }

  const { data } = await query;
  if (!data) return false;

  // 멤버별 PB 추출
  const pbMap = new Map<string, { sec: number; gender: string }>();
  for (const row of data) {
    const mst = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    const gender = (mst as { gdr_enm?: string } | null)?.gdr_enm ?? "";
    const existing = pbMap.get(row.mem_id);
    if (!existing || row.rec_time_sec < existing.sec) {
      pbMap.set(row.mem_id, { sec: row.rec_time_sec, gender });
    }
  }

  const myPb = pbMap.get(memId);
  if (!myPb) return false;

  const checkGender = (gender: string) => {
    const filtered = [...pbMap.entries()]
      .filter(([, v]) => v.gender === gender)
      .sort(([, a], [, b]) => a.sec - b.sec);
    const myRank = filtered.findIndex(([id]) => id === memId) + 1;
    if (myRank === 0) return false;
    // rank=-1 은 꼴찌(마지막 순위) 특수값
    if (rule.rank === -1) return myRank === filtered.length;
    return myRank === rule.rank;
  };

  if (rule.gender === "any") {
    return checkGender("male") || checkGender("female");
  }
  return checkGender(rule.gender);
}

/**
 * 팀 내 성별 종목 PB 꼴찌인 경우 (예: 마지막영웅)
 * gender="any": 남녀 각각 지정 종목 중 하나라도 꼴찌이면 true
 */
export async function evalRaceRankLastInternal(
  rule: CondRaceRankLast,
  memId: string,
  teamId: string,
  db: DB,
): Promise<boolean> {
  for (const sport of rule.sports) {
    const isLast = await evalRaceRankByGenderInternal(
      {
        type: "race_rank_by_gender",
        sport,
        sport_ctgr: rule.sport_ctgr,
        gender: rule.gender,
        rank: -1, // 꼴찌 특수값
      },
      memId,
      teamId,
      db,
    );
    if (isLast) return true;
  }
  return false;
}

/** 풀코스 PB가 목표 기록 중 하나와 N초 이내 차이로 미달인 경우 (예: 억울해?) */
export async function evalRacePbWithinSecOfTargetInternal(
  rule: CondRacePbWithinSecOfTarget,
  memId: string,
  db: DB,
): Promise<boolean> {
  const sport = rule.sport.toUpperCase();

  const { data } = await db
    .from("rec_race_hist")
    .select("rec_time_sec, comp_evt_cfg!inner(comp_evt_type)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("comp_evt_cfg.comp_evt_type", sport)
    .order("rec_time_sec", { ascending: true })
    .limit(1);

  if (!data?.[0]) return false;

  const myPb = data[0].rec_time_sec;
  return rule.targets.some(
    (target) => myPb > target && myPb - target <= rule.within_sec,
  );
}

/** 지정한 카테고리 각각에서 칭호를 1개 이상 보유한 경우 (예: 전천후) */
export async function evalHasTitleInCategoriesInternal(
  rule: CondHasTitleInCategories,
  teamMemId: string,
  teamId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("mem_ttl_rel")
    .select("ttl_mst!inner(ttl_ctgr_cd)")
    .eq("team_mem_id", teamMemId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (!data) return false;

  const heldCategories = new Set(
    data.map((row) => {
      const mst = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
      return (mst as { ttl_ctgr_cd?: string } | null)?.ttl_ctgr_cd ?? "";
    }),
  );

  return rule.categories.every((cat) => heldCategories.has(cat));
}

// ---------------------------------------------------------------------------
// 공개 진입점 — engine.ts 에서 호출
// ---------------------------------------------------------------------------

/**
 * CondRule 하나를 평가한다.
 * engine.ts 가 TRIGGER_COND_MAP 필터링과 team_mem_id → mem_id 변환을 완료한 뒤 호출한다.
 * 각 평가 함수는 ctx(트리거 종류)에 의존하지 않는다.
 */
export async function evaluateCondition(
  rule: CondRule,
  ctx: TitleEvalContext,
  memId: string,
  db: DB,
): Promise<boolean> {
  switch (rule.type) {
    case "race_pb_under_sec":
      return evalRacePbUnderSecInternal(rule, memId, db);

    case "race_finish_count":
      return evalRaceFinishCountInternal(rule, memId, db);

    case "mileage_run_complete":
      return evalMileageRunCompleteInternal(rule, ctx.teamMemId, db);

    case "attendance_count":
      return evalAttendanceCountInternal(rule, memId, db);

    case "membership_days":
      return evalMembershipDaysInternal(rule, ctx.teamMemId, db);

    case "race_pb_faster_than_member":
      return evalRacePbFasterThanMemberInternal(rule, memId, db);

    case "joined_on_date":
      return evalJoinedOnDateInternal(rule, ctx.teamMemId, db);

    case "race_finish_in_month_range":
      return evalRaceFinishInMonthRangeInternal(rule, memId, db);

    case "race_finish_all_titles":
      return evalRaceFinishAllTitlesInternal(rule, ctx.teamMemId, ctx.teamId, db);

    case "race_finish_all_of":
      return evalRaceFinishAllOfInternal(rule, memId, db);

    case "race_finish_total":
      return evalRaceFinishTotalInternal(rule, memId, db);

    case "race_finish_in_year":
      return evalRaceFinishInYearInternal(rule, memId, db);

    case "race_rank_by_gender":
      return evalRaceRankByGenderInternal(rule, memId, ctx.teamId, db);

    case "race_rank_last":
      return evalRaceRankLastInternal(rule, memId, ctx.teamId, db);

    case "race_pb_within_sec_of_target":
      return evalRacePbWithinSecOfTargetInternal(rule, memId, db);

    case "has_title_in_categories":
      return evalHasTitleInCategoriesInternal(rule, ctx.teamMemId, ctx.teamId, db);

    default:
      // 타입 exhaustiveness 체크 — 새 CondRule 타입 추가 시 컴파일 에러로 알려준다
      rule satisfies never;
      return false;
  }
}
