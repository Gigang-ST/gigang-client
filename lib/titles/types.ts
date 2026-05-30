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

/** 팀 내 UTMB 인덱스 전체 1위인 경우 (예: 山神) */
export type CondUtmbIdxRank = {
  type: "utmb_idx_rank";
  rank: number;
};

// ---------------------------------------------------------------------------
// 마일리지런 전용 CondRule 타입
// 평가 소스: evt_mlg_act_hist, evt_mlg_mth_snap, evt_team_prt_rel, evt_team_mst
// ---------------------------------------------------------------------------

/** 마일리지런 이벤트에 참가 신청한 경우 (예: 시작이반) */
export type CondMileageJoined = {
  type: "mileage_joined";
};

/** 마일리지런에서 월 목표를 N번 이상 달성한 경우 (예: 목표달성=1, 내돈내놔=5) */
export type CondMileageGoalAchievedMonths = {
  type: "mileage_goal_achieved_months";
  count: number;
};

/** 마일리지런에서 act_dt가 해당 월 마지막 날인 기록으로 처음 월 목표를 달성한 경우 (예: 막판스퍼트) */
export type CondMileageGoalAchievedOnLastDay = {
  type: "mileage_goal_achieved_on_last_day";
};

/** 마일리지런에서 한 달 안에 지정 종목을 모두 1회 이상 기록한 경우 (예: 올라운더) */
export type CondMileageAllSportsInMonth = {
  type: "mileage_all_sports_in_month";
  sports: string[];
};

/** 마일리지런에서 월 목표 달성 실패 누적 N개월 이상인 경우 (예: 보증금증발=1, ATM=3) */
export type CondMileageGoalFailedMonths = {
  type: "mileage_goal_failed_months";
  count: number;
};

/**
 * 이벤트 마지막달/마지막전달 중 하나라도 월 목표 대비 N% 이상 달성한 경우 (예: 마지막불꽃)
 * position: "last" = end_dt 월, "second_last" = end_dt 전월
 */
export type CondMileageRocketInMonths = {
  type: "mileage_rocket_in_months";
  position: ("last" | "second_last")[];
  threshold: number;
};

/** 마일리지런에서 한 달 목표를 지정 종목 기록만으로 달성한 경우 (예: 러닝원툴) */
export type CondMileageGoalAchievedBySingleSport = {
  type: "mileage_goal_achieved_by_single_sport";
  sport: string;
};

/** 마일리지런에서 한 달 마일리지의 N% 이상을 지정 종목으로 달성한 경우 (예: 수달·두바퀴인생·흙이좋아) */
export type CondMileageSportRatio = {
  type: "mileage_sport_ratio";
  sport: string;
  min_ratio: number;
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
  | CondHasTitleInCategories
  | CondUtmbIdxRank
  | CondMileageJoined
  | CondMileageGoalAchievedMonths
  | CondMileageGoalAchievedOnLastDay
  | CondMileageAllSportsInMonth
  | CondMileageGoalFailedMonths
  | CondMileageRocketInMonths
  | CondMileageGoalAchievedBySingleSport
  | CondMileageSportRatio;

// ---------------------------------------------------------------------------
// TriggerKind — 트리거 종류
// 새 트리거 추가 시 여기에 문자열 리터럴 하나를 추가한다.
// ---------------------------------------------------------------------------
export type TriggerKind =
  | "race_record"    // 대회 기록 등록/수정
  | "mileage_run"    // 마일리지런 기록 등록
  | "mileage_batch"  // 마일리지런 월초 배치 (전월 마감 후 확정 조건)
  | "attendance"     // 로그인 / 출석 체크
  | "manual_sweep";  // 관리자 수동 전체 재계산

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
  mileage_run: [
    "mileage_run_complete",
    "mileage_joined",
    "mileage_goal_achieved_months",
    "mileage_goal_achieved_on_last_day",
    "mileage_all_sports_in_month",
    "mileage_rocket_in_months",
  ],
  mileage_batch: [
    "mileage_goal_achieved_months",
    "mileage_goal_failed_months",
    "mileage_goal_achieved_by_single_sport",
    "mileage_sport_ratio",
  ],
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
    "utmb_idx_rank",
    // 마일리지런 즉시 평가 조건 (시점 무관하게 재계산 가능)
    "mileage_joined",
    "mileage_goal_achieved_months", // count:1(목표달성)만 해당 — count:5(내돈내놔)는 배치 전용
    "mileage_goal_achieved_on_last_day",
    "mileage_all_sports_in_month",
    "mileage_rocket_in_months",
    // 배치 전용 조건은 manual_sweep 제외 — 월 마감 후 고정 시점에만 의미있음
    // mileage_goal_achieved_months(count:5), mileage_goal_failed_months,
    // mileage_goal_achieved_by_single_sport, mileage_sport_ratio
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
  /** 입력한 기록의 운동 날짜 (YYYY-MM-DD). 막판스퍼트 판단에 사용 */
  actDt: string;
  /** 기록 입력 전 당월 achv_yn 상태. 막판스퍼트 판단에 사용 */
  prevAchvYn: boolean;
};

/** 마일리지런 월초 배치 — 전월 기준 확정 조건 평가 */
export type TitleEvalContextMileageBatch = {
  trigger: "mileage_batch";
  teamId: string;
  teamMemId: string;
  projectId: string;
  /** 평가 기준 월의 마지막 날짜 (YYYY-MM-DD). 전월 데이터 조회에 사용 */
  actDt: string;
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
  | TitleEvalContextMileageBatch
  | TitleEvalContextAttendance
  | TitleEvalContextManualSweep;
