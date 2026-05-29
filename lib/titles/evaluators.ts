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

    default:
      // 타입 exhaustiveness 체크 — 새 CondRule 타입 추가 시 컴파일 에러로 알려준다
      rule satisfies never;
      return false;
  }
}
