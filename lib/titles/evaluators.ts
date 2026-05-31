/**
 * 칭호 조건 평가 함수 모음
 *
 * 각 함수는 순수하게 "이 멤버가 이 조건을 충족하는가?" 만 판단한다.
 * DB 조회만 하고 INSERT/UPDATE는 하지 않는다.
 * ctx(트리거 컨텍스트)에 의존하지 않는다 — 트리거 필터링은 engine.ts 의 TRIGGER_COND_MAP 이 담당한다.
 *
 * 새 CondRule 타입을 추가하면 evaluateCondition() switch 에 케이스를 추가한다.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const KST = "Asia/Seoul";

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
  CondUtmbIdxRank,
  CondMileageJoined,
  CondMileageGoalAchievedMonths,
  CondMileageGoalAchievedOnLastDay,
  CondMileageAllSportsInMonth,
  CondMileageGoalFailedMonths,
  CondMileageRocketInMonths,
  CondMileageGoalAchievedBySingleSport,
  CondMileageSportRatio,
} from "./types";
import type { MemberSnapshot, RaceHistRow } from "./snapshot";
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
  void rule; void teamMemId; void db;
  return false;
}

export async function evalAttendanceCountInternal(
  rule: CondAttendanceCount,
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

  const diffDays = dayjs().tz(KST).diff(dayjs(data.join_dt).tz(KST), "day");
  return diffDays >= rule.days;
}

export async function evalRacePbFasterThanMemberInternal(
  rule: CondRacePbFasterThanMember,
  memId: string,
  db: DB,
): Promise<boolean> {
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

  const joinKST = dayjs(data.join_dt).tz(KST);
  return joinKST.month() + 1 === rule.month && joinKST.date() === rule.day;
}

/** 특정 월 범위 내에 대회를 완주한 적 있는 경우 */
export async function evalRaceFinishInMonthRangeInternal(
  rule: CondRaceFinishInMonthRange,
  memId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("rec_race_hist")
    .select("race_result_id, comp_mst!inner(stt_dt, comp_sprt_cd), comp_evt_cfg!inner(comp_evt_type)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  if (!data) return false;

  return data.some((row) => {
    const mst = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
    const compDate = (mst as { stt_dt?: string; comp_sprt_cd?: string } | null)?.stt_dt;
    const sprtCd = (mst as { comp_sprt_cd?: string } | null)?.comp_sprt_cd ?? null;
    const evtCfg = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
    const evtType = (evtCfg as { comp_evt_type?: string } | null)?.comp_evt_type?.toUpperCase() ?? "";

    if (!compDate) return false;
    const month = dayjs(compDate).tz(KST).month() + 1;
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
  const year = rule.year ?? dayjs().tz(KST).year();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data } = await db
    .from("rec_race_hist")
    .select("race_result_id, comp_mst!inner(stt_dt)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  if (!data) return false;

  const count = data.filter((row) => {
    const mst = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
    const compDate = (mst as { stt_dt?: string } | null)?.stt_dt ?? "";
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
  const sport = rule.sport?.toUpperCase();

  // 팀 소속 mem_id 목록 조회 — 팀 외 멤버 PB가 섞이지 않도록 필터
  const { data: teamMembers } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (!teamMembers?.length) return false;
  const teamMemIds = teamMembers.map((r) => r.mem_id);

  let query = db
    .from("rec_race_hist")
    .select("mem_id, rec_time_sec, comp_evt_cfg!inner(comp_evt_type), comp_mst!inner(comp_sprt_cd), mem_mst!inner(gdr_enm)")
    .in("mem_id", teamMemIds)
    .eq("del_yn", false)
    .eq("vers", 0);

  if (sport) query = query.eq("comp_evt_cfg.comp_evt_type", sport);
  if (rule.sport_ctgr) query = query.eq("comp_mst.comp_sprt_cd", rule.sport_ctgr);

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

  if (!pbMap.has(memId)) return false;

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
        rank: -1,
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

/** 팀 내 UTMB 인덱스 전체 N위인 경우 (예: 山神 — rank=1) */
export async function evalUtmbIdxRankInternal(
  rule: CondUtmbIdxRank,
  memId: string,
  teamId: string,
  db: DB,
): Promise<boolean> {
  const { data: teamMembers } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (!teamMembers?.length) return false;
  const teamMemIds = teamMembers.map((r) => r.mem_id);

  const { data } = await db
    .from("mem_utmb_prf")
    .select("mem_id, utmb_idx")
    .in("mem_id", teamMemIds)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (!data?.length) return false;

  const sorted = [...data].sort((a, b) => b.utmb_idx - a.utmb_idx);
  const myRank = sorted.findIndex((r) => r.mem_id === memId) + 1;
  if (myRank === 0) return false;
  return myRank === rule.rank;
}

// ---------------------------------------------------------------------------
// 마일리지런 전용 evaluator 함수 (즉시 평가용, DB 기반)
// ---------------------------------------------------------------------------

/** 마일리지런 이벤트에 참가 신청한 경우 (예: 시작이반) */
export async function evalMileageJoinedInternal(
  _rule: CondMileageJoined,
  memId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("evt_team_prt_rel")
    .select("prt_id")
    .eq("mem_id", memId)
    .limit(1)
    .maybeSingle();
  return data !== null;
}

/** 마일리지런에서 월 목표를 N번 이상 달성한 경우 (예: 목표달성, 내돈내놔) */
export async function evalMileageGoalAchievedMonthsInternal(
  rule: CondMileageGoalAchievedMonths,
  teamMemId: string,
  db: DB,
): Promise<boolean> {
  const { data: memRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!memRow?.mem_id) return false;

  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id")
    .eq("mem_id", memRow.mem_id)
    .eq("aprv_yn", true);
  if (!prtRows?.length) return false;

  const prtIds = prtRows.map((r) => r.prt_id);
  const { count } = await db
    .from("evt_mlg_mth_snap")
    .select("*", { count: "exact", head: true })
    .in("prt_id", prtIds)
    .eq("achv_yn", true);

  return (count ?? 0) >= rule.count;
}

/**
 * act_dt가 해당 월 마지막 날인 기록으로 처음 월 목표를 달성한 경우 (예: 막판스퍼트)
 * ctx.prevAchvYn: 기록 입력 전 당월 achv_yn (engine에서 주입)
 * ctx.actDt: 입력한 기록의 운동 날짜
 */
export async function evalMileageGoalAchievedOnLastDayInternal(
  _rule: CondMileageGoalAchievedOnLastDay,
  ctx: TitleEvalContext,
  teamMemId: string,
  db: DB,
): Promise<boolean> {
  if (ctx.trigger !== "mileage_run") return false;
  if (ctx.prevAchvYn) return false; // 이미 달성 상태였으면 해당 없음

  const actDt = ctx.actDt; // YYYY-MM-DD
  const actDay = dayjs(actDt).tz(KST);
  const lastDayOfMonth = actDay.endOf("month").date();
  if (actDay.date() !== lastDayOfMonth) return false;

  // 기록 입력 후 당월 achv_yn 확인
  const actMonth = actDt.slice(0, 7) + "-01";
  const { data: memRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!memRow?.mem_id) return false;

  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id")
    .eq("mem_id", memRow.mem_id)
    .eq("aprv_yn", true);
  if (!prtRows?.length) return false;

  const prtIds = prtRows.map((r) => r.prt_id);
  const { data: snap } = await db
    .from("evt_mlg_mth_snap")
    .select("achv_yn")
    .in("prt_id", prtIds)
    .eq("base_dt", actMonth)
    .maybeSingle();

  return snap?.achv_yn === true;
}

/** 한 달 안에 지정 종목을 모두 1회 이상 기록한 경우 (예: 올라운더) */
export async function evalMileageAllSportsInMonthInternal(
  rule: CondMileageAllSportsInMonth,
  teamMemId: string,
  actDt: string,
  db: DB,
): Promise<boolean> {
  const { data: memRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!memRow?.mem_id) return false;

  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id")
    .eq("mem_id", memRow.mem_id)
    .eq("aprv_yn", true);
  if (!prtRows?.length) return false;

  const prtIds = prtRows.map((r) => r.prt_id);
  const monthPrefix = actDt.slice(0, 7); // YYYY-MM
  const nextMonth = dayjs(`${monthPrefix}-01`).tz(KST).add(1, "month").format("YYYY-MM-DD");
  const { data } = await db
    .from("evt_mlg_act_hist")
    .select("sprt_enm")
    .in("prt_id", prtIds)
    .gte("act_dt", `${monthPrefix}-01`)
    .lt("act_dt", nextMonth);

  if (!data) return false;
  const sportsInMonth = new Set(data.map((r) => r.sprt_enm as string));
  return rule.sports.every((s) => sportsInMonth.has(s));
}

/** 월 목표 달성 실패 누적 N개월 이상인 경우 (예: 보증금증발, ATM) — 월초 배치 전용 */
export async function evalMileageGoalFailedMonthsInternal(
  rule: CondMileageGoalFailedMonths,
  teamMemId: string,
  db: DB,
): Promise<boolean> {
  const { data: memRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!memRow?.mem_id) return false;

  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id, evt_team_mst!inner(stt_dt, end_dt)")
    .eq("mem_id", memRow.mem_id)
    .eq("aprv_yn", true);
  if (!prtRows?.length) return false;

  const today = dayjs().tz(KST).format("YYYY-MM-01");
  let failCount = 0;
  for (const prt of prtRows) {
    const evtMst = Array.isArray(prt.evt_team_mst) ? prt.evt_team_mst[0] : prt.evt_team_mst;
    const { stt_dt, end_dt } = evtMst as { stt_dt: string; end_dt: string };
    const { data: snaps } = await db
      .from("evt_mlg_mth_snap")
      .select("achv_yn, base_dt")
      .eq("prt_id", prt.prt_id)
      .gte("base_dt", stt_dt.slice(0, 7) + "-01")
      .lt("base_dt", today < end_dt.slice(0, 7) + "-01" ? today : end_dt.slice(0, 7) + "-01");

    failCount += (snaps ?? []).filter((s) => !s.achv_yn).length;
  }

  return failCount >= rule.count;
}

/** 이벤트 마지막달/마지막전달에 목표 대비 N% 이상 달성한 경우 (예: 마지막불꽃) */
export async function evalMileageRocketInMonthsInternal(
  rule: CondMileageRocketInMonths,
  teamMemId: string,
  actDt: string,
  db: DB,
): Promise<boolean> {
  const { data: memRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!memRow?.mem_id) return false;

  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id, evt_team_mst!inner(end_dt)")
    .eq("mem_id", memRow.mem_id)
    .eq("aprv_yn", true);
  if (!prtRows?.length) return false;

  const actMonth = actDt.slice(0, 7) + "-01"; // YYYY-MM-01

  for (const prt of prtRows) {
    const evtMst = Array.isArray(prt.evt_team_mst) ? prt.evt_team_mst[0] : prt.evt_team_mst;
    const endDt = (evtMst as { end_dt: string }).end_dt;
    const lastMonth = endDt.slice(0, 7) + "-01";
    const secondLastMonth = dayjs(lastMonth).tz(KST).subtract(1, "month").format("YYYY-MM-01");

    const targetMonths: string[] = [];
    if (rule.position.includes("last")) targetMonths.push(lastMonth);
    if (rule.position.includes("second_last")) targetMonths.push(secondLastMonth);

    if (!targetMonths.includes(actMonth)) continue;

    const { data: snap } = await db
      .from("evt_mlg_mth_snap")
      .select("achv_mlg, goal_mlg")
      .eq("prt_id", prt.prt_id)
      .eq("base_dt", actMonth)
      .maybeSingle();

    if (!snap) continue;
    const ratio = Number(snap.achv_mlg) / Number(snap.goal_mlg);
    if (ratio >= rule.threshold) return true;
  }

  return false;
}

/** 한 달 목표를 지정 종목 기록만으로 달성한 경우 (예: 러닝원툴) */
export async function evalMileageGoalAchievedBySingleSportInternal(
  rule: CondMileageGoalAchievedBySingleSport,
  teamMemId: string,
  actDt: string,
  db: DB,
): Promise<boolean> {
  const { data: memRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!memRow?.mem_id) return false;

  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id")
    .eq("mem_id", memRow.mem_id)
    .eq("aprv_yn", true);
  if (!prtRows?.length) return false;

  const prtIds = prtRows.map((r) => r.prt_id);
  const monthPrefix = actDt.slice(0, 7);
  const actMonth = monthPrefix + "-01";

  // 당월 달성 여부 확인
  const { data: snap } = await db
    .from("evt_mlg_mth_snap")
    .select("achv_yn")
    .in("prt_id", prtIds)
    .eq("base_dt", actMonth)
    .maybeSingle();
  if (!snap?.achv_yn) return false;

  // 당월 기록 중 지정 종목 외 기록이 있는지 확인
  const nextMonth2 = dayjs(`${monthPrefix}-01`).tz(KST).add(1, "month").format("YYYY-MM-DD");
  const { data: otherRecords } = await db
    .from("evt_mlg_act_hist")
    .select("act_id")
    .in("prt_id", prtIds)
    .gte("act_dt", `${monthPrefix}-01`)
    .lt("act_dt", nextMonth2)
    .neq("sprt_enm", rule.sport as "RUNNING" | "TRAIL" | "CYCLING" | "SWIMMING")
    .limit(1);

  return !otherRecords?.length;
}

/** 한 달 마일리지의 N% 이상을 지정 종목으로 달성한 경우 (예: 수달·두바퀴인생·흙이좋아) */
export async function evalMileageSportRatioInternal(
  rule: CondMileageSportRatio,
  teamMemId: string,
  actDt: string,
  db: DB,
): Promise<boolean> {
  const { data: memRow } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!memRow?.mem_id) return false;

  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id")
    .eq("mem_id", memRow.mem_id)
    .eq("aprv_yn", true);
  if (!prtRows?.length) return false;

  const prtIds = prtRows.map((r) => r.prt_id);
  const monthPrefix = actDt.slice(0, 7);
  const nextMonth3 = dayjs(`${monthPrefix}-01`).tz(KST).add(1, "month").format("YYYY-MM-DD");
  const { data } = await db
    .from("evt_mlg_act_hist")
    .select("sprt_enm, final_mlg")
    .in("prt_id", prtIds)
    .gte("act_dt", `${monthPrefix}-01`)
    .lt("act_dt", nextMonth3);

  if (!data?.length) return false;

  const total = data.reduce((sum, r) => sum + Number(r.final_mlg), 0);
  if (total === 0) return false;
  const sportTotal = data
    .filter((r) => r.sprt_enm === rule.sport)
    .reduce((sum, r) => sum + Number(r.final_mlg), 0);

  return sportTotal / total >= rule.min_ratio;
}

// ---------------------------------------------------------------------------
// 공개 진입점 — engine.ts 에서 호출
// ---------------------------------------------------------------------------

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

    case "utmb_idx_rank":
      return evalUtmbIdxRankInternal(rule, memId, ctx.teamId, db);

    case "mileage_joined":
      return evalMileageJoinedInternal(rule, memId, db);

    case "mileage_goal_achieved_months":
      return evalMileageGoalAchievedMonthsInternal(rule, ctx.teamMemId, db);

    case "mileage_goal_achieved_on_last_day":
      return evalMileageGoalAchievedOnLastDayInternal(rule, ctx, ctx.teamMemId, db);

    case "mileage_all_sports_in_month":
      return ctx.trigger === "mileage_run"
        ? evalMileageAllSportsInMonthInternal(rule, ctx.teamMemId, ctx.actDt, db)
        : false;

    case "mileage_goal_failed_months":
      return evalMileageGoalFailedMonthsInternal(rule, ctx.teamMemId, db);

    case "mileage_rocket_in_months":
      return ctx.trigger === "mileage_run"
        ? evalMileageRocketInMonthsInternal(rule, ctx.teamMemId, ctx.actDt, db)
        : false;

    case "mileage_goal_achieved_by_single_sport":
      return (ctx.trigger === "mileage_run" || ctx.trigger === "mileage_batch")
        ? evalMileageGoalAchievedBySingleSportInternal(rule, ctx.teamMemId, ctx.actDt, db)
        : false;

    case "mileage_sport_ratio":
      return (ctx.trigger === "mileage_run" || ctx.trigger === "mileage_batch")
        ? evalMileageSportRatioInternal(rule, ctx.teamMemId, ctx.actDt, db)
        : false;

    default:
      rule satisfies never;
      return false;
  }
}

// ---------------------------------------------------------------------------
// 공개 진입점 2 — bulk sweep 전용 (MemberSnapshot 메모리 평가, DB 쿼리 없음)
// ---------------------------------------------------------------------------

/**
 * CondRule 하나를 스냅샷 데이터만으로 평가한다. (manual_sweep 전용)
 * DB 왕복 없이 메모리 내에서만 연산한다.
 *
 * @param allSnapshots  race_pb_faster_than_member 처럼 타 멤버 데이터가 필요한 조건을 위해 전체 맵을 전달한다.
 */
export function evaluateConditionFromSnapshot(
  rule: CondRule,
  snapshot: MemberSnapshot,
  allSnapshots: Map<string, MemberSnapshot>,
  /** mileage_batch 전용: 평가 기준 월 (YYYY-MM). 월 고정 조건 필터링에 사용. */
  baseMonth?: string,
): boolean {
  switch (rule.type) {
    case "race_pb_under_sec":
      return evalRacePbUnderSecFromSnapshot(rule, snapshot.raceHist);

    case "race_finish_count":
      return evalRaceFinishCountFromSnapshot(rule, snapshot.raceHist);

    case "mileage_run_complete":
      return false; // TODO: 마일리지런 스냅샷 구현 전까지 false

    case "attendance_count":
      return snapshot.raceHist.length >= rule.count;

    case "membership_days": {
      if (!snapshot.joinDt) return false;
      const diffDays = Math.floor(
        (Date.now() - new Date(snapshot.joinDt).getTime()) / (1000 * 60 * 60 * 24),
      );
      return diffDays >= rule.days;
    }

    case "race_pb_faster_than_member":
      return evalRacePbFasterThanMemberFromSnapshot(rule, snapshot, allSnapshots);

    case "joined_on_date": {
      if (!snapshot.joinDt) return false;
      const joinKST = new Date(new Date(snapshot.joinDt).toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      return joinKST.getMonth() + 1 === rule.month && joinKST.getDate() === rule.day;
    }

    case "race_finish_in_month_range":
      return snapshot.raceHist.some((r) => {
        if (!r.comp_date) return false;
        const month = new Date(r.comp_date).getMonth() + 1;
        const typeMatch = !rule.sport || r.comp_evt_type === rule.sport.toUpperCase();
        const ctgrMatch = !rule.sport_ctgr || r.comp_sprt_cd === rule.sport_ctgr;
        return rule.months.includes(month) && typeMatch && ctgrMatch;
      });

    case "race_finish_all_titles":
      // race_finish_all_titles: 지정 칭호명 목록을 전부 보유 — snapshot 미지원, false 처리
      return false;

    case "race_finish_all_of": {
      // sports 목록 각각에서 최소 count번 완주
      return rule.sports.every((sport) => {
        const cnt = snapshot.raceHist.filter((r) => {
          const typeMatch = r.comp_evt_type === sport.toUpperCase();
          const ctgrMatch = !rule.sport_ctgr || r.comp_sprt_cd === rule.sport_ctgr;
          return typeMatch && ctgrMatch;
        }).length;
        return cnt >= rule.count;
      });
    }

    case "race_finish_total":
      return snapshot.raceHist.length >= rule.count;

    case "race_finish_in_year": {
      const targetYear = rule.year ?? new Date().getFullYear();
      const count = snapshot.raceHist.filter((r) => {
        if (!r.comp_date) return false;
        return new Date(r.comp_date).getFullYear() === targetYear;
      }).length;
      return count >= rule.count;
    }

    case "race_rank_by_gender":
      return evalRaceRankByGenderFromSnapshot(rule, snapshot, allSnapshots);

    case "race_rank_last":
      return evalRaceRankLastFromSnapshot(rule, snapshot, allSnapshots);

    case "race_pb_within_sec_of_target": {
      const sport = rule.sport.toUpperCase();
      const myPb = snapshot.raceHist
        .filter((r) => r.comp_evt_type === sport)
        .reduce<number | null>((min, r) => (min === null || r.rec_time_sec < min ? r.rec_time_sec : min), null);
      if (myPb === null) return false;
      return rule.targets.some((target) => myPb > target && myPb - target <= rule.within_sec);
    }

    case "has_title_in_categories": {
      const heldCtgrs = new Set([...snapshot.heldTitleMeta.values()].map((m) => m.ttl_ctgr_cd));
      return rule.categories.every((c: string) => heldCtgrs.has(c));
    }

    case "utmb_idx_rank": {
      if (snapshot.utmbIdx === null) return false;
      const sorted = [...allSnapshots.values()]
        .filter((s) => s.utmbIdx !== null)
        .sort((a, b) => b.utmbIdx! - a.utmbIdx!);
      const myRank = sorted.findIndex((s) => s.memId === snapshot.memId) + 1;
      if (myRank === 0) return false;
      return myRank === rule.rank;
    }

    case "mileage_joined":
      return snapshot.mileageParticipant;

    case "mileage_goal_achieved_months": {
      // baseMonth 지정 시 해당 월까지만 집계 (미래 달 제외)
      const snaps = baseMonth
        ? snapshot.mileageMthSnaps.filter((s) => s.base_dt.slice(0, 7) <= baseMonth)
        : snapshot.mileageMthSnaps;
      const achieved = snaps.filter((s) => s.achv_yn).length;
      return achieved >= rule.count;
    }

    case "mileage_goal_achieved_on_last_day":
      // sweep은 실시간 입력 이벤트가 아니므로 평가 불가 — false
      return false;

    case "mileage_all_sports_in_month": {
      // 어느 한 달이라도 지정 종목 전부 기록한 달이 있으면 true
      const months = [...new Set(snapshot.mileageActHist.map((r) => r.act_dt.slice(0, 7)))];
      return months.some((month) => {
        const sportsInMonth = new Set(
          snapshot.mileageActHist.filter((r) => r.act_dt.startsWith(month)).map((r) => r.sprt_enm),
        );
        return rule.sports.every((s) => sportsInMonth.has(s));
      });
    }

    case "mileage_goal_failed_months": {
      // baseMonth 지정 시 해당 월까지만 집계 (미래 달 제외)
      const snaps = baseMonth
        ? snapshot.mileageMthSnaps.filter((s) => s.base_dt.slice(0, 7) <= baseMonth)
        : snapshot.mileageMthSnaps;
      const failed = snaps.filter((s) => !s.achv_yn).length;
      return failed >= rule.count;
    }

    case "mileage_rocket_in_months": {
      if (!snapshot.mileageEvtEndDt) return false;
      const lastMonth = snapshot.mileageEvtEndDt.slice(0, 7) + "-01";
      const secondLastMonth = (() => {
        const [y, m] = lastMonth.slice(0, 7).split("-").map(Number);
        const pm = m - 1 === 0 ? 12 : m - 1;
        const py = m - 1 === 0 ? y - 1 : y;
        return `${py}-${String(pm).padStart(2, "0")}-01`;
      })();
      const targets = rule.position.map((p) => p === "last" ? lastMonth : secondLastMonth);
      return snapshot.mileageMthSnaps.some((s) => {
        if (!targets.includes(s.base_dt)) return false;
        if (s.goal_mlg === 0) return false;
        return s.achv_mlg / s.goal_mlg >= rule.threshold;
      });
    }

    case "mileage_goal_achieved_by_single_sport": {
      // baseMonth 지정 시 해당 월만, 없으면 어느 한 달이라도
      const snaps = baseMonth
        ? snapshot.mileageMthSnaps.filter((s) => s.base_dt.startsWith(baseMonth))
        : snapshot.mileageMthSnaps;
      return snaps.some((snap) => {
        if (!snap.achv_yn) return false;
        const month = snap.base_dt.slice(0, 7);
        const monthActs = snapshot.mileageActHist.filter((r) => r.act_dt.startsWith(month));
        return monthActs.length > 0 && monthActs.every((r) => r.sprt_enm === rule.sport);
      });
    }

    case "mileage_sport_ratio": {
      // baseMonth 지정 시 해당 월만, 없으면 어느 한 달이라도
      const months = baseMonth
        ? [baseMonth]
        : [...new Set(snapshot.mileageActHist.map((r) => r.act_dt.slice(0, 7)))];
      return months.some((month) => {
        const acts = snapshot.mileageActHist.filter((r) => r.act_dt.startsWith(month));
        const total = acts.reduce((s, r) => s + r.final_mlg, 0);
        if (total === 0) return false;
        const sportTotal = acts.filter((r) => r.sprt_enm === rule.sport).reduce((s, r) => s + r.final_mlg, 0);
        return sportTotal / total >= rule.min_ratio;
      });
    }

    default:
      rule satisfies never;
      return false;
  }
}

// ---------------------------------------------------------------------------
// snapshot 기반 내부 평가 함수 (메모리 전용)
// ---------------------------------------------------------------------------

function evalRacePbUnderSecFromSnapshot(
  rule: CondRacePersonalBestUnderSec,
  raceHist: RaceHistRow[],
): boolean {
  const candidates = raceHist.filter((r) => {
    const typeMatch = r.comp_evt_type === rule.sport.toUpperCase();
    const ctgrMatch = !rule.sport_ctgr || r.comp_sprt_cd === rule.sport_ctgr;
    return typeMatch && ctgrMatch;
  });
  if (candidates.length === 0) return false;
  const pb = Math.min(...candidates.map((r) => r.rec_time_sec));
  return pb <= rule.sec;
}

function evalRaceFinishCountFromSnapshot(
  rule: CondRaceFinishCount,
  raceHist: RaceHistRow[],
): boolean {
  const count = raceHist.filter((r) => {
    const typeMatch = !rule.sport || r.comp_evt_type === rule.sport.toUpperCase();
    const ctgrMatch = !rule.sport_ctgr || r.comp_sprt_cd === rule.sport_ctgr;
    return typeMatch && ctgrMatch;
  }).length;
  return count >= rule.count;
}

function evalRacePbFasterThanMemberFromSnapshot(
  rule: CondRacePbFasterThanMember,
  snapshot: MemberSnapshot,
  allSnapshots: Map<string, MemberSnapshot>,
): boolean {
  if (snapshot.memId === rule.target_mem_id) return false;

  const targetSnapshot = [...allSnapshots.values()].find((s) => s.memId === rule.target_mem_id);
  const sport = rule.sport.toUpperCase();

  const myPb = snapshot.raceHist
    .filter((r) => r.comp_evt_type === sport)
    .reduce<number | null>((min, r) => (min === null || r.rec_time_sec < min ? r.rec_time_sec : min), null);

  const targetPb = (targetSnapshot?.raceHist ?? [])
    .filter((r) => r.comp_evt_type === sport)
    .reduce<number | null>((min, r) => (min === null || r.rec_time_sec < min ? r.rec_time_sec : min), null);

  if (myPb === null || targetPb === null) return false;
  return myPb < targetPb;
}

function evalRaceRankByGenderFromSnapshot(
  rule: CondRaceRankByGender,
  snapshot: MemberSnapshot,
  allSnapshots: Map<string, MemberSnapshot>,
): boolean {
  const sport = rule.sport?.toUpperCase();

  // 멤버별 PB 추출 (전체 snapshot 기준)
  const pbMap = new Map<string, { sec: number; gender: string }>();
  for (const s of allSnapshots.values()) {
    const candidates = s.raceHist.filter((r) => {
      const typeMatch = !sport || r.comp_evt_type === sport;
      const ctgrMatch = !rule.sport_ctgr || r.comp_sprt_cd === rule.sport_ctgr;
      return typeMatch && ctgrMatch;
    });
    if (candidates.length === 0) continue;
    const pb = Math.min(...candidates.map((r) => r.rec_time_sec));
    pbMap.set(s.memId, { sec: pb, gender: s.gender });
  }

  if (!pbMap.has(snapshot.memId)) return false;

  const checkGender = (gender: string) => {
    const filtered = [...pbMap.entries()]
      .filter(([, v]) => v.gender === gender)
      .sort(([, a], [, b]) => a.sec - b.sec);
    const myRank = filtered.findIndex(([id]) => id === snapshot.memId) + 1;
    if (myRank === 0) return false;
    return myRank === rule.rank;
  };

  if (rule.gender === "any") return checkGender("male") || checkGender("female");
  return checkGender(rule.gender);
}

function evalRaceRankLastFromSnapshot(
  rule: CondRaceRankLast,
  snapshot: MemberSnapshot,
  allSnapshots: Map<string, MemberSnapshot>,
): boolean {
  // sports 목록 중 하나라도 꼴찌면 true
  return rule.sports.some((sport) => {
    const pbMap = new Map<string, { sec: number; gender: string }>();
    for (const s of allSnapshots.values()) {
      const candidates = s.raceHist.filter((r) => {
        const typeMatch = r.comp_evt_type === sport.toUpperCase();
        const ctgrMatch = !rule.sport_ctgr || r.comp_sprt_cd === rule.sport_ctgr;
        return typeMatch && ctgrMatch;
      });
      if (candidates.length === 0) continue;
      const pb = Math.min(...candidates.map((r) => r.rec_time_sec));
      pbMap.set(s.memId, { sec: pb, gender: s.gender });
    }

    if (!pbMap.has(snapshot.memId)) return false;

    const checkGender = (gender: string) => {
      const filtered = [...pbMap.entries()]
        .filter(([, v]) => v.gender === gender)
        .sort(([, a], [, b]) => a.sec - b.sec);
      const myRank = filtered.findIndex(([id]) => id === snapshot.memId) + 1;
      if (myRank === 0) return false;
      return myRank === filtered.length;
    };

    if (rule.gender === "any") return checkGender("male") || checkGender("female");
    return checkGender(rule.gender);
  });
}
