/**
 * 주 시작 요일 — 캘린더 그리드가 한 줄을 어느 요일부터 시작할지.
 *
 * 한국 관행(종이 달력·네이버·카카오·삼성 캘린더)이 일요일 시작이라 **기본은 일요일**이고,
 * 월요일 시작(ISO 8601 · 유럽 · 다이어리류)에 익숙한 사람만 설정에서 바꾼다.
 *
 * **저장은 쿠키다.** localStorage로 두면 SSR이 값을 모른 채 일요일 그리드를 그려 내려보내고,
 * 마운트 후 월요일로 다시 그리면서 **모든 날짜가 한 칸씩 밀리는 재배치**가 눈에 보인다.
 * 게다가 서버가 조회한 범위와 화면 그리드가 어긋나 가장자리 며칠이 빈 채로 떴다가 뒤늦게
 * 채워진다. 쿠키는 요청에 실려 오므로 첫 렌더부터 맞는 그리드가 나온다.
 * (홈 필터 설정이 localStorage여도 되는 건 그건 **이미 받아온 데이터를 거르기만** 하고
 *  조회 범위를 안 바꾸기 때문이다 — 여기는 조회 범위 자체가 달라진다.)
 *
 * DB(`team_mem_rel` 컬럼)로 두지 않은 이유: 마이그레이션 + 이력 함수 동반 갱신이 붙는데
 * **일정탭은 비로그인도 보는 지면**이라 로그인 회원만 설정할 수 있게 되는 게 더 이상하다.
 * 대가는 기기별로 따로 설정된다는 점이고, 표시 취향 하나엔 그 편이 맞다.
 */

/** 0 = 일요일, 1 = 월요일. dayjs `.day()`와 같은 번호 체계를 쓴다. */
export const WEEK_STARTS = [0, 1] as const;

export type WeekStart = (typeof WEEK_STARTS)[number];

export const DEFAULT_WEEK_START: WeekStart = 0;

/** 쿠키 이름 — 서버(읽기)와 설정 액션(쓰기)이 공유한다. */
export const WEEK_START_COOKIE = "gg-week-start";

/** 설정 화면에 그대로 쓰는 라벨. "주차 시작일"은 ISO 주차 계산을 연상시켜 쓰지 않는다. */
export const WEEK_START_LABEL: Record<WeekStart, string> = {
  0: "일요일",
  1: "월요일",
};

/**
 * 쿠키 값 → `WeekStart`. 값이 없거나 알 수 없으면 기본(일요일).
 *
 * 쿠키는 사용자가 직접 고칠 수 있으므로 아무 문자열이나 들어올 수 있다고 보고 판정한다 —
 * 여기서 통과시키면 `weekdayColumn`이 음수/범위 밖 인덱스를 만들어 그리드가 통째로 어긋난다.
 */
export function parseWeekStart(raw: string | null | undefined): WeekStart {
  const parsed = Number(raw);
  return WEEK_STARTS.includes(parsed as WeekStart)
    ? (parsed as WeekStart)
    : DEFAULT_WEEK_START;
}

const SUNDAY_FIRST = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 요일 헤더 라벨 — 시작 요일에 맞춰 회전한다.
 *
 * 헤더 색상(일=빨강·토=파랑)은 인덱스가 아니라 **라벨 문자열**로 걸려 있어
 * (`mini-calendar.tsx`) 회전해도 그대로 따라온다. 색을 인덱스로 바꾸지 말 것.
 */
export function weekdayLabels(weekStart: WeekStart): readonly string[] {
  return weekStart === 0
    ? SUNDAY_FIRST
    : [...SUNDAY_FIRST.slice(1), SUNDAY_FIRST[0]];
}

/**
 * dayjs `.day()`(0=일) → 그리드 열 인덱스(0 = 그 주의 첫 칸).
 *
 * 시작 요일이 걸린 날짜 계산은 **전부 이 함수 하나를 통과한다.** 호출부마다
 * `(day() + 6) % 7` 같은 식을 따로 쓰면 한 곳만 고쳐져 그리드와 조회 범위가 갈린다.
 */
export function weekdayColumn(dow: number, weekStart: WeekStart): number {
  return (dow - weekStart + 7) % 7;
}
