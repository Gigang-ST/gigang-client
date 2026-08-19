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
 * 팀 내 종목 PB 순위가 N위인 경우 (예: 기강1황, Queen, 하프킹, 단거리왕, 山神)
 * gender: "male" | "female" — 해당 성별 내 순위
 * gender: "any" — 남녀 각각 1명씩 부여
 * gender: "overall" — 성별 구분 없이 전체 통합 순위 1명만 부여
 */
export type CondRaceRankByGender = {
  type: "race_rank_by_gender";
  sport?: string;
  sport_ctgr?: string;
  /** "male" | "female" | "any" | "overall" */
  gender: "male" | "female" | "any" | "overall";
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
  /** true: baseMonth 해당 달만 체크 (보증금증발). false/없음: 이벤트 기간 내 누적 (ATM) */
  only_base_month?: boolean;
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

// ---------------------------------------------------------------------------
// 모임 계열 (2026-08 신규) — 평가는 `evaluators-gathering.ts`
// 설계: docs/design/2026-07-30-신규-칭호-후보-모임-깅스타그램.md §7.1
//
// ⚠️ 이 계열은 전부 `ttl_mst.eff_stt_dt`(적용 시작일) 필터를 받고, 기준은 **모임이 실제로
//    열린 날**(`gthr_mst.stt_at`, KST 환산)이다 — 신청·취소 시각이 아니다(§7.5).
// ---------------------------------------------------------------------------

/** #1 한 달력월(KST)에 조건에 맞는 모임 참석 N회 (미라클·올빼미·오픈런) */
export type CondGthrAttendInMonth = {
  type: "gthr_attend_in_month";
  count: number;
  /** 모임 시작 시각(KST) 하한 "HH:mm" — 이 시각 **이후** 시작 (올빼미: "21:00") */
  after_time?: string;
  /** 모임 시작 시각(KST) 상한 "HH:mm" — 이 시각 **이전** 시작 (미라클: "07:00") */
  before_time?: string;
  /** true면 그 모임의 첫 신청자(개설자 제외)인 것만 센다 (오픈런) */
  first_applicant?: boolean;
};

/** #2 self 취소 누적 N회 (다음엔꼭·회전문·월요병) */
export type CondGthrCancelCount = {
  type: "gthr_cancel_count";
  count: number;
  /** true면 취소일 = 모임 당일(KST)인 것만 (다음엔꼭) */
  same_day?: boolean;
  /** 지정 시 그 요일(0=일 … 1=월)에 열린 모임의 취소만 (월요병) */
  weekday?: number;
  /** true면 "같은 모임에서 N건" 기준으로 센다 (회전문) */
  same_gathering?: boolean;
};

/** #3 모임 참석일이 N일 연속 (3연벙) — 하루에 여러 개 나가도 그날은 1일 */
export type CondGthrAttendStreak = {
  type: "gthr_attend_streak";
  days: number;
};

/** #4 한 달력월(KST) 모임 참석률이 N 이상 (프로참석러). 달이 끝나야 확정 → 월 배치 전용 */
export type CondGthrMonthAttendRate = {
  type: "gthr_month_attend_rate";
  /** 0~1. 0.7 = 70% */
  min_rate: number;
  /** 그 달에 이 수 이상 열린 달만 판정 */
  min_gatherings: number;
};

/** #5 같은 KST 날짜의 서로 다른 모임 N건에 모두 참석한 날이 M일 (하루에두번) */
export type CondGthrSameDayCount = {
  type: "gthr_same_day_count";
  per_day: number;
  count: number;
};

/** #6 정원이 있는 모임에서 신청 순번이 정확히 정원 번째 (막차) */
export type CondGthrLastSlot = {
  type: "gthr_last_slot";
  count: number;
};

/** #10 self 취소 사유 조건 (칼퇴실패·구구절절) */
export type CondGthrCancelReason = {
  type: "gthr_cancel_reason";
  count: number;
  /** 사유에 이 문자열이 포함된 것만 (칼퇴실패: "야근") */
  keyword?: string;
  /** 사유 길이가 이 값 이상인 것만 (구구절절: 40) */
  min_length?: number;
};

/** #22 생일(월·일)에 크루와 함께 나감 — 모임 참석 또는 대회 출전 (생일축하해) */
export type CondAttendOnBirthday = {
  type: "attend_on_birthday";
  count: number;
};

// ---------------------------------------------------------------------------
// 깅스타그램 · 댓글 · 응원 · 대회 계열 (2026-08 신규) — 평가는 `evaluators-social.ts`
// ---------------------------------------------------------------------------

/** #11 깅스타그램 사진 글 누적 N장 (오운완 3장 · 깅플루언서 10장) */
export type CondPostCount = { type: "post_count"; count: number };

/** #12 같은 KST 월에 사진 글을 올린 서로 다른 `act_dt` 수 (연재작가 월 5일) */
export type CondPostDaysInMonth = { type: "post_days_in_month"; days: number };

/** #13 활동일보다 N일 이상 늦게 올린 글 (유물발굴) — 날짜끼리 비교, 경과 시각이 아니다 */
export type CondPostBackfillDays = { type: "post_backfill_days"; days: number; count: number };

/** #14 자기 게시물의 최초 댓글을 본인이 단 횟수 (자문자답) */
export type CondPostSelfFirstComment = { type: "post_self_first_comment"; count: number };

/** #15 대댓글 N개 (말대꾸) — 삭제 제외 */
export type CondCmntReplyCount = { type: "cmnt_reply_count"; count: number };

/** #16 @멘션 N회 (소환술사) — 자기 자신 멘션 제외, 같은 사람 반복은 포함 */
export type CondCmntMentionCount = { type: "cmnt_mention_count"; count: number };

/**
 * #17 한 KST 달력월의 댓글 수 1위 (투머치토커)
 *
 * 동률 1위면 아무에게도 안 준다. 월이 끝나야 확정되므로 월 마감 배치 전용이다.
 */
export type CondCmntMonthlyTop = {
  type: "cmnt_monthly_top";
  /** 그 달 최소 댓글 수 — 조용한 달에 2개 쓰고 1위가 되는 걸 막는다 */
  min_count: number;
};

/** #18 받은 응원 누적 N (인간화로) — race(대회 응원) 제외. 적용일 필터 불가(§7.5) */
export type CondRctnRecvTotal = { type: "rctn_recv_total"; count: number };

/** #19 완주 기록이 정확히 시간 단위로 떨어짐 (완벽한기록) */
export type CondRaceTimeExactHour = { type: "race_time_exact_hour"; count: number };

/**
 * #21 같은 종목 맞대결 역전 (하수야~ / 고수님..)
 *
 * 적용일은 **역전이 일어난 나중 대회** 기준이다 — 둘 다 요구하면 발급까지 몇 년 걸린다.
 */
export type CondRacePairReversal = {
  type: "race_pair_reversal";
  /** "winner" = 먼저 지고 나중에 이긴 쪽(하수야~), "loser" = 그 반대(고수님..) */
  direction: "winner" | "loser";
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
  | CondMileageSportRatio
  // 모임 계열 (2026-08 신규)
  | CondGthrAttendInMonth
  | CondGthrCancelCount
  | CondGthrAttendStreak
  | CondGthrMonthAttendRate
  | CondGthrSameDayCount
  | CondGthrLastSlot
  | CondGthrCancelReason
  | CondAttendOnBirthday
  // 깅스타그램 · 댓글 · 응원 · 대회 계열 (2026-08 신규)
  | CondPostCount
  | CondPostDaysInMonth
  | CondPostBackfillDays
  | CondPostSelfFirstComment
  | CondCmntReplyCount
  | CondCmntMentionCount
  | CondCmntMonthlyTop
  | CondRctnRecvTotal
  | CondRaceTimeExactHour
  | CondRacePairReversal;

// ---------------------------------------------------------------------------
// TriggerKind — 트리거 종류
// 새 트리거 추가 시 여기에 문자열 리터럴 하나를 추가한다.
// ---------------------------------------------------------------------------
export type TriggerKind =
  | "race_record"    // 대회 기록 등록/수정
  | "mileage_run"    // 마일리지런 기록 등록
  | "mileage_batch"  // 마일리지런 월초 배치 (전월 마감 후 확정 조건)
  | "attendance"        // 로그인 / 출석 체크
  | "manual_sweep"      // 관리자 수동 전체 재계산
  // --- 2026-08 신규 (설계 §7.2) ---
  | "gathering_attend"  // 모임 참석 액션 — 신청 순번의 사건(막차)만
  | "gathering_cancel"  // 모임 취소 액션 — 취소 계열만
  | "gathering_daily"   // 일 배치 — 끝난 지 3일 지난 모임까지 (참석 계열)
  | "post_create"       // 깅스타그램 게시
  | "comment_create"    // 댓글 작성
  | "title_monthly";    // 월 마감 배치 — 달이 끝나야 값이 정해지는 것 + 전원 재평가

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
    // 완벽한기록 — 기록을 저장하는 그 순간 확정된다(추가 훅이 필요 없다).
    "race_time_exact_hour",
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
    // mileage_goal_achieved_months: engine에서 count-aware 필터로 count=1만 통과
    "mileage_goal_achieved_months",
    "mileage_goal_achieved_on_last_day",
    "mileage_all_sports_in_month",
    "mileage_rocket_in_months",
    // 배치 전용 조건은 manual_sweep 제외 — 월 마감 후 고정 시점에만 의미있음
    // mileage_goal_failed_months, mileage_goal_achieved_by_single_sport, mileage_sport_ratio
    //
    // ⚠️ **모임 계열은 여기 없다.** 이유가 둘이다.
    //
    // ① sweep은 `MemberSnapshot`(메모리)만 보는데 거기엔 모임 데이터가 없다(설계 §7.3
    //    스냅샷 확장 미구현). 등록하면 스냅샷 경로가 항상 false를 돌려줘 **조용히
    //    아무에게도 안 붙는다** — 이 엔진에서 가장 찾기 어려운 실패다.
    //
    // ② 나중에 스냅샷을 확장하더라도 **`eff_stt_dt`를 반영하기 전에는 등록하면 안 된다.**
    //    관리자가 "전체 재계산"을 누르는 순간 적용일 이전 과거가 통째로 소급 부여된다 —
    //    "sweep을 돌려도 과거는 소급하지 않는다"가 이 컬럼의 존재 이유다(§7.5).
    //    `evaluateConditionFromSnapshot`이 `effStartDt`를 인자로 받아 두는 것도 그래서다.
    //
    // 그동안은 아래 두 배치가 그 역할을 하므로 재계산 없이도 붙는다.
  ],

  // --- 2026-08 신규 트리거 ---

  // 그 순간 확정되는 것만. **등록과 취소를 나눠 둔다** — 한 트리거로 묶으면 취소할 때마다
  // 막차(신청 순번)까지 평가해 **취소와 무관한 조회 2번**이 응답 안에 그대로 얹힌다.
  // 취소 계열 5종은 같은 취소 이력을 캐시로 나눠 쓰지만 막차는 그 캐시를 안 타므로
  // (`evalGthrLastSlot`), 취소 경로에서 가장 무거운 몫이 정확히 필요 없는 몫이었다.
  //
  // 막차가 참석 액션에 남는 이유 — 신청 순번의 사건이라 3일 뒤로 미루면 그 사이 노쇼가
  // 지워져 "정확히 정원 번째" 행이 아예 사라진다(미루면 오히려 아무도 못 딴다).
  gathering_attend: ["gthr_last_slot"],

  // 취소 계열 — 취소 이력(`gthr_attd_hist`)만 보므로 등록 액션에서 평가할 이유가 없다.
  gathering_cancel: ["gthr_cancel_count", "gthr_cancel_reason"],

  // 참석 계열 — 끝난 지 3일 지난 모임만 본다. 운영진이 노쇼를 사후 취소 처리하는 시간이다.
  // 즉시 판정하면 ① 아직 안 열린 모임을 신청만 해도 붙고 ② 비회수라 취소해도 안 없어진다.
  gathering_daily: ["gthr_attend_in_month", "gthr_attend_streak", "gthr_same_day_count", "attend_on_birthday"],

  post_create: ["post_count", "post_days_in_month", "post_backfill_days"],

  comment_create: ["post_self_first_comment", "cmnt_reply_count", "cmnt_mention_count"],

  // 달이 끝나야 값이 정해지는 것(참석률·월 1위)과 **전원 재평가가 필요한 것**(응원·페어).
  //
  // 참석률은 달 중간에 75%였다가 남은 모임을 빠지면 최종이 70% 아래로 내려가는데,
  // 비회수라 먼저 준 칭호는 안 돌아온다.
  //
  // 응원(#18)·페어(#21)를 여기 두는 이유는 다르다 — **실시간 훅으로 하기엔 비싸서**다.
  // 응원은 연타마다 액션이 나가고, 페어는 상대 데이터를 봐야 해 단일 멤버 훅으로 못 푼다.
  // ⚠️ 그렇다고 `manual_sweep`에만 두면 **단장이 버튼을 누를 때까지 아무에게도 안 붙어**
  // 그 둘만 수동이 된다. 월 배치가 어차피 전원을 도므로 여기 얹는다(설계 §7.2).
  title_monthly: [
    "gthr_month_attend_rate",
    "cmnt_monthly_top",
    "rctn_recv_total",
    "race_pair_reversal",
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

/**
 * 그 순간 확정되는 조건만 평가하는 액션 트리거들 — 추가 데이터가 없어 한 모양을 공유한다.
 * (모임 참석 / 모임 취소 / 깅스타그램 게시 / 댓글 작성)
 *
 * 참석과 취소는 **같은 모양이지만 다른 트리거다** — 보는 조건이 갈린다(TRIGGER_COND_MAP).
 */
export type TitleEvalContextGatheringAttend = {
  trigger: "gathering_attend" | "gathering_cancel" | "post_create" | "comment_create";
  teamId: string;
  teamMemId: string;
};

/**
 * 일 배치 — 참석 계열.
 *
 * `asOfDt`는 **"이 날짜까지 시작한 모임만 센다"**는 상한이다(KST, YYYY-MM-DD).
 * 배치가 `오늘 − ATTEND_GRACE_DAYS`를 넣어 유예를 만든다 — 판정 시점을 인자로 받아야
 * 테스트가 시계를 고정할 수 있고, 유예 일수를 바꿀 때 한 곳만 고친다.
 */
export type TitleEvalContextGatheringDaily = {
  trigger: "gathering_daily";
  teamId: string;
  teamMemId: string;
  asOfDt: string;
};

/** 월 마감 배치 — `baseMonth`(YYYY-MM)는 **지난 달**이어야 한다(진행 중인 달은 값이 안 정해짐). */
export type TitleEvalContextTitleMonthly = {
  trigger: "title_monthly";
  teamId: string;
  teamMemId: string;
  baseMonth: string;
  /**
   * 모임 조회 상한(KST, YYYY-MM-DD) — 배치가 **기준 월의 말일**을 넣는다.
   * 안 주면 다음 달 모임이 섞여 "그 달 참석률"이 아니게 된다.
   */
  asOfDt: string;
};

export type TitleEvalContext =
  | TitleEvalContextRaceRecord
  | TitleEvalContextMileageRun
  | TitleEvalContextMileageBatch
  | TitleEvalContextAttendance
  | TitleEvalContextManualSweep
  | TitleEvalContextGatheringAttend
  | TitleEvalContextGatheringDaily
  | TitleEvalContextTitleMonthly;

/**
 * 모임 참석 판정을 미루는 유예(일).
 *
 * `gthr_attd_rel`에는 **출석 체크 컬럼이 없다** — 실제로 나갔는지를 DB가 모른다.
 * 대신 운영진이 안 나온 사람을 사후에 취소 처리하므로(보통 2~3일 안) 출석부는 늦게나마
 * 정확해진다. 그래서 참석 계열은 **끝난 지 이만큼 지난 모임만** 센다(설계 §4.1).
 */
export const ATTEND_GRACE_DAYS = 3;
