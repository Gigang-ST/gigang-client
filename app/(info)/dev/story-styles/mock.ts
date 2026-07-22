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
