/**
 * 칭호 자동 부여 엔진 타입 정의
 *
 * CondRule         — ttl_mst.cond_rule_json 에 저장되는 JSON 스키마
 * TriggerKind      — 트리거 종류 (서버 액션에서 호출할 때 지정)
 * TRIGGER_COND_MAP — 트리거별로 평가할 CondRule 타입 목록
 * TitleEvalContext — evaluateAndGrantTitles() 에 전달하는 컨텍스트
 */

// ---------------------------------------------------------------------------
// 이펙트 타입 — effect_mst.effect_cd 값 (배지/프레임 공통)
// TitleEffect는 하위호환을 위해 유지, 실제 값은 effect_mst에서 관리
// ---------------------------------------------------------------------------
export type TitleEffect = string;

// ---------------------------------------------------------------------------
// CondRule — DB(cond_rule_json)에 저장되는 조건 규칙 스키마
// ---------------------------------------------------------------------------

/** 특정 종목 PB(최고 기록)이 N초 이하인 경우 */
export type CondRacePersonalBestUnderSec = {
  type: "race_pb_under_sec";
  /** comp_evt_type 값. 예: "FULL", "HALF", "10K" */
  sport: string;
  sec: number;
  /** comp_mst.comp_sprt_cd 값. 생략 시 sport(comp_evt_type)만으로 필터 */
  sport_ctgr?: string;
};

/** 특정 종목 완주 횟수가 N회 이상인 경우 */
export type CondRaceFinishCount = {
  type: "race_finish_count";
  /** comp_evt_type 값. 없으면 sport_ctgr 내 전체 거리 허용 */
  sport?: string;
  count: number;
  /** comp_mst.comp_sprt_cd 값 (road_run | trail_run | triathlon | cycling | ultra) */
  sport_ctgr?: string;
};

/** 마일리지런 프로젝트 완주(목표 달성)인 경우 */
export type CondMileageRunComplete = {
  type: "mileage_run_complete";
  /** 특정 프로젝트만 대상으로 할 경우 지정. null 이면 어떤 프로젝트든 */
  projectId?: string | null;
};

/** 출석(로그인 또는 기록 등록) 누적 횟수가 N회 이상인 경우 */
export type CondAttendanceCount = {
  type: "attendance_count";
  count: number;
};

/** 팀 가입 후 N일 이상 경과한 경우 */
export type CondMembershipDays = {
  type: "membership_days";
  days: number;
};

/** 특정 멤버의 종목 PB보다 빠른 경우 (예: 서브현근) */
export type CondRacePbFasterThanMember = {
  type: "race_pb_faster_than_member";
  /** comp_evt_type 값. 예: "FULL" */
  sport: string;
  /** 비교 대상 mem_mst.mem_id */
  target_mem_id: string;
};

/** 모든 조건 유형의 유니온 — 새 조건 추가 시 여기에 타입을 추가한다 */
export type CondRule =
  | CondRacePersonalBestUnderSec
  | CondRaceFinishCount
  | CondMileageRunComplete
  | CondAttendanceCount
  | CondMembershipDays
  | CondRacePbFasterThanMember;

// ---------------------------------------------------------------------------
// TriggerKind — 트리거 종류
// 새 트리거 추가 시 여기에 문자열 리터럴 하나를 추가한다.
// ---------------------------------------------------------------------------
export type TriggerKind =
  | "race_record"   // 대회 기록 등록/수정
  | "mileage_run"   // 마일리지런 기록 등록
  | "attendance"    // 로그인 / 출석 체크
  | "manual_sweep"; // 관리자 수동 전체 재계산

// ---------------------------------------------------------------------------
// TRIGGER_COND_MAP — 트리거별로 평가할 CondRule 타입 목록
//
// 핵심 규칙:
//   - 트리거가 발생하면 이 맵에 등록된 조건 유형만 평가한다.
//   - 등록되지 않은 조건은 해당 트리거에서 아예 실행되지 않는다.
//   - manual_sweep 은 모든 조건을 포함한다 (관리자 일괄 재계산).
//
// 새 트리거를 추가하면 반드시 이 맵에도 항목을 추가해야 한다.
// satisfies 키워드가 누락된 TriggerKind 를 컴파일 타임에 잡아준다.
// ---------------------------------------------------------------------------
export const TRIGGER_COND_MAP = {
  race_record:  ["race_pb_under_sec", "race_finish_count", "race_pb_faster_than_member"],
  mileage_run:  ["mileage_run_complete"],
  attendance:   ["attendance_count", "membership_days"],
  manual_sweep: [
    "race_pb_under_sec",
    "race_finish_count",
    "mileage_run_complete",
    "attendance_count",
    "membership_days",
    "race_pb_faster_than_member",
  ],
} satisfies Record<TriggerKind, CondRule["type"][]>;

// ---------------------------------------------------------------------------
// TitleEvalContext — 트리거 호출 시 엔진에 전달하는 컨텍스트
// 트리거마다 필요한 추가 데이터가 다르므로 유니온 타입으로 정의한다.
// ---------------------------------------------------------------------------

/** 대회 기록 등록/수정 시 */
export type TitleEvalContextRaceRecord = {
  trigger: "race_record";
  teamId: string;
  teamMemId: string;
};

/** 마일리지런 기록 등록 시 */
export type TitleEvalContextMileageRun = {
  trigger: "mileage_run";
  teamId: string;
  teamMemId: string;
  projectId: string;
};

/** 로그인 / 출석 체크 시 */
export type TitleEvalContextAttendance = {
  trigger: "attendance";
  teamId: string;
  teamMemId: string;
};

/** 관리자 수동 전체 재계산 */
export type TitleEvalContextManualSweep = {
  trigger: "manual_sweep";
  teamId: string;
  teamMemId: string;
};

export type TitleEvalContext =
  | TitleEvalContextRaceRecord
  | TitleEvalContextMileageRun
  | TitleEvalContextAttendance
  | TitleEvalContextManualSweep;
