/**
 * 스타일 비교용 목업 데이터.
 *
 * 실데이터(RPC)와 형태만 맞추고 값은 고정한다 — 스타일끼리 같은 내용을 그려야
 * 디자인 차이만 보이기 때문. 이 파일은 `/dev/story-styles` 전용이며 프로덕션 경로에서 쓰지 않는다.
 */

export type MockPerson = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
};

export const MOCK_LEDE = {
  kicker: "기록",
  headline: "김준민, 풀코스를 완주하다",
  standfirst: "서울마라톤 · 개인 최고 기록",
  figure: "03:42:11",
  figureLabel: "풀코스",
  person: { mem_id: "m-1", mem_nm: "김준민", avatar_url: null } as MockPerson,
};

export const MOCK_NEWBIES: (MockPerson & { joined: string })[] = [
  { mem_id: "m-2", mem_nm: "이서준", avatar_url: null, joined: "7.20" },
  { mem_id: "m-3", mem_nm: "박지훈", avatar_url: null, joined: "7.18" },
  { mem_id: "m-4", mem_nm: "최유나", avatar_url: null, joined: "7.11" },
];

export const MOCK_RECORDS: {
  mem_id: string;
  mem_nm: string;
  label: string;
  time: string;
  sport: string;
}[] = [
  { mem_id: "m-1", mem_nm: "김준민", label: "풀코스", time: "03:42:11", sport: "road_run" },
  { mem_id: "m-5", mem_nm: "정하영", label: "하프", time: "01:38:04", sport: "road_run" },
  { mem_id: "m-6", mem_nm: "오세빈", label: "트레일", time: "05:12:47", sport: "trail_run" },
];

export const MOCK_RACE = {
  comp_nm: "춘천마라톤",
  date: "10월 26일",
  reg_cnt: 12,
  dday: "D-95",
};

export const MOCK_KING = {
  mem_id: "m-7",
  mem_nm: "한지우",
  avatar_url: null,
  attd_cnt: 9,
};

export const MOCK_ACTV: (MockPerson & { rank: number; score: number })[] = [
  { rank: 1, mem_id: "m-1", mem_nm: "김준민", avatar_url: null, score: 140 },
  { rank: 2, mem_id: "m-7", mem_nm: "한지우", avatar_url: null, score: 120 },
  { rank: 3, mem_id: "m-5", mem_nm: "정하영", avatar_url: null, score: 95 },
  { rank: 4, mem_id: "m-6", mem_nm: "오세빈", avatar_url: null, score: 70 },
  { rank: 5, mem_id: "m-2", mem_nm: "이서준", avatar_url: null, score: 55 },
];

export const MOCK_WEEK = { gthr_cnt: 7, attd_cnt: 34, rec_cnt: 2 };

/** 기강 기상대 — 크루 분위기 한 단어 + 근거 수치 + 8주 추세 */
export const MOCK_WEATHER = {
  /** 분위기 한 단어 — 개인 컨디션과 같은 4단계 어휘 */
  mood: "활기참",
  /** 이번 주 / 직전 4주 평균 비율 — 판정 근거 */
  ratio: 1.24,
  stats: [
    { label: "이번 주 모임", value: "7회" },
    { label: "연인원 참석", value: "34명" },
    { label: "새 기록", value: "2건" },
    { label: "활동 멤버", value: "18명" },
  ],
  /** 8주 추세(상대값 0~1) — 막대/스파크라인 */
  trend: [0.42, 0.55, 0.38, 0.61, 0.7, 0.52, 0.66, 0.86],
};

/** 기록 자랑 팻말 — 사진은 미리보기라 placeholder로 그린다 */
export const MOCK_FLEX: {
  id: string;
  mem_nm: string;
  comment: string;
  dist: string;
  date: string;
  sport: string;
}[] = [
  { id: "f-1", mem_nm: "김준민", comment: "오늘 페이스 좋았다", dist: "10.2km", date: "7.24", sport: "러닝" },
  { id: "f-2", mem_nm: "정하영", comment: "비 맞고 뛴 날", dist: "8.0km", date: "7.23", sport: "러닝" },
  { id: "f-3", mem_nm: "오세빈", comment: "산에서 다리 풀림", dist: "21.1km", date: "7.21", sport: "트레일러닝" },
];

/** 현상수배 — 오래 안 나온 얼굴들 */
export const MOCK_GHOSTS: (MockPerson & { days: number })[] = [
  { mem_id: "m-8", mem_nm: "서지호", avatar_url: null, days: 42 },
  { mem_id: "m-9", mem_nm: "문가영", avatar_url: null, days: 35 },
  { mem_id: "m-10", mem_nm: "배준호", avatar_url: null, days: 28 },
];

/** 발행 정보 — 제호 아래 한 줄 */
export const MOCK_DATELINE = "2026년 7월 24일 금요일";

/** 각오 띄우기 시안용 — 길이를 일부러 섞었다(짧은 것·긴 것 둘 다 담겨야 레이아웃이 검증된다) */
export const MOCK_PLEDGES: {
  id: string;
  mem_id: string;
  mem_nm: string;
  text: string;
  when: string;
}[] = [
  { id: "p-1", mem_id: "m-1", mem_nm: "김준민", text: "올해 안에 서브4. 이번엔 진짜.", when: "2시간 전" },
  { id: "p-2", mem_id: "m-5", mem_nm: "정하영", text: "화요일 정모는 무조건 나간다", when: "어제" },
  { id: "p-3", mem_id: "m-6", mem_nm: "오세빈", text: "부상 없이 춘천까지", when: "3일 전" },
  { id: "p-4", mem_id: "m-2", mem_nm: "이서준", text: "첫 하프, 완주만 하자", when: "5일 전" },
  { id: "p-5", mem_id: "m-7", mem_nm: "한지우", text: "달리기 싫은 날에도 신발은 신는다", when: "1주 전" },
];
