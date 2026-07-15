// 참여 지표 정의 상수 — 단일 출처.
// 서버 집계(get-participation-stats)와 클라이언트 판정(participation-tab/-section)이
// 같은 값을 쓰도록 여기서만 정의한다 (선례: lib/constants/dues-quest.ts).

/** 참여 온도·무활동·신규 판정 기준 일수 (설계: 4주) */
export const RECENT_WINDOW_DAYS = 28;

/** 열심 기준: 최근 4주 모임 참석 횟수 */
export const HOT_THRESHOLD = 4;

/** 이 일수 이상 참여가 없으면 이탈 신호로 경고 표시 */
export const INACTIVE_WARN_DAYS = RECENT_WINDOW_DAYS;

/** 모임 데이터 실질 시작일 — "전체" 기간도 이 이전은 집계에서 제외 */
export const PARTICIPATION_DATA_EPOCH = "2026-07-01";

/** 월별 참석 미니 차트의 창 크기(개월) */
export const MONTHLY_WINDOW = 6;
