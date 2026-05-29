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

/** 특정 날짜(월/일)에 가입한 경우 (예: 7월 7일 가입) */
export type CondJoinedOnDate = {
  type: "joined_on_date";
  month: number;
  day: number;
};

/** 특정 월 범위 내에 대회를 완주한 적 있는 경우 (예: 봄 3~4월) */
export type CondRaceFinishInMonthRange = {
  type: "race_finish_in_month_range";
  /** 해당하는 월 목록. 예: [3,4] (봄), [12,1] (겨울) */
  months: number[];
  /** 종목 필터. 생략 시 전체 */
  sport?: string;
  sport_ctgr?: string;
};

/** 지정한 칭호명 목록을 모두 보유한 경우 (예: 사계절 — 봄·여름·가을·겨울 전부) */
export type CondRaceFinishAllTitles = {
  type: "race_finish_all_titles";
  /** 모두 보유해야 하는 ttl_nm 목록 */
  ttl_nms: string[];
};

/** 복수 종목을 모두 N회 이상 완주한 경우 (예: 멀티러너 — 10K·하프·풀 각 1회) */
export type CondRaceFinishAllOf = {
  type: "race_finish_all_of";
  sports: string[];
  count: number;
  sport_ctgr?: string;
};

/** 종목 무관 전체 완주 횟수가 N회 이상인 경우 (예: 대회왕) */
export type CondRaceFinishTotal = {
  type: "race_finish_total";
  count: number;
};

/** 한 해(연도) 내 완주 횟수가 N회 이상인 경우 (예: 시즌러너, 돈을 달린다) */
export type CondRaceFinishInYear = {
  type: "race_finish_in_year";
  count: number;
  /** 기준 연도. 생략 시 현재 연도 */
  year?: number;
};

/**
 * 팀 내 성별 종목 PB 순위가 N위 이하인 경우 (예: 기강1황, Queen, 하프킹, 단거리왕)
 * gender: "male" | "female" | "any" — "any"는 남녀 각각 1명씩 부여 (山神, 단거리왕, 마지막영웅)
 */
export type CondRaceRankByGender = {
  type: "race_rank_by_gender";
  sport: string;
  sport_ctgr?: string;
  /** "male" | "female" | "any" */
  gender: "male" | "female" | "any";
  rank: number;
};

/**
 * 팀 내 성별 종목 PB 꼴찌인 경우 (예: 마지막영웅)
 * gender: "any" — 남녀 각각 꼴찌 1명씩 부여
 */
export type CondRaceRankLast = {
  type: "race_rank_last";
  sports: string[];
  sport_ctgr?: string;
  gender: "male" | "female" | "any";
};

/** 풀코스 PB가 목표 기록(초) 중 하나와 N초 이내 차이로 미달인 경우 (예: 억울해?) */
export type CondRacePbWithinSecOfTarget = {
  type: "race_pb_within_sec_of_target";
  sport: string;
  /** 목표 기록(초) 목록. 예: [14400, 12600, 11400, 10800] */
  targets: number[];
  within_sec: number;
};

/** 지정한 카테고리 각각에서 칭호를 1개 이상 보유한 경우 (예: 전천후) */
export type CondHasTitleInCategories = {
  type: "has_title_in_categories";
  categories: string[];
};

/** 모든 조건 유형의 유니온 — 새 조건 추가 시 여기에 타입을 추가한다 */
export type CondRule =
  | CondRacePersonalBestUnderSec
  | CondRaceFinishCount
  | CondMileageRunComplete
  | CondAttendanceCount
  | CondMembershipDays
  | CondRacePbFasterThanMember
  | CondJoinedOnDate
  | CondRaceFinishInMonthRange
  | CondRaceFinishAllTitles
  | CondRaceFinishAllOf
  | CondRaceFinishTotal
  | CondRaceFinishInYear
  | CondRaceRankByGender
  | CondRaceRankLast
  | CondRacePbWithinSecOfTarget
  | CondHasTitleInCategories;

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
  race_record: [
    "race_pb_under_sec",
    "race_finish_count",
    "race_pb_faster_than_member",
    "race_finish_in_month_range",
    "race_finish_all_of",
    "race_finish_total",
    "race_finish_in_year",
    "race_rank_by_gender",
    "race_rank_last",
    "race_pb_within_sec_of_target",
    "race_finish_all_titles",
    "has_title_in_categories",
  ],
  mileage_run: ["mileage_run_complete"],
  attendance:  ["attendance_count", "membership_days", "joined_on_date"],
  manual_sweep: [
    "race_pb_under_sec",
    "race_finish_count",
    "mileage_run_complete",
    "attendance_count",
    "membership_days",
    "race_pb_faster_than_member",
    "joined_on_date",
    "race_finish_in_month_range",
    "race_finish_all_titles",
    "race_finish_all_of",
    "race_finish_total",
    "race_finish_in_year",
    "race_rank_by_gender",
    "race_rank_last",
    "race_pb_within_sec_of_target",
    "has_title_in_categories",
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
