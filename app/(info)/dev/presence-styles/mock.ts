/**
 * 접속자 표시 시안용 목업.
 *
 * `story-styles`의 mock을 가져다 쓰지 않고 따로 둔다 — 두 시안 폴더는 각각
 * 결론이 나면 통째로 지울 것이라, 서로 물려 있으면 한쪽만 못 지운다.
 * 이 파일은 `/dev/presence-styles` 전용이며 프로덕션 경로에서 쓰지 않는다.
 */
export const MOCK_READERS: {
  mem_id: string;
  mem_nm: string;
  /** 지금 보고 있는 섹션 */
  section: string;
  /** 지면 세로 위치(0~100%) — 여백 레일 시안에서 아바타 높이로 쓴다 */
  at: number;
}[] = [
  { mem_id: "m-5", mem_nm: "정하영", section: "새 얼굴", at: 18 },
  { mem_id: "m-6", mem_nm: "오세빈", section: "최근 기록", at: 52 },
  { mem_id: "m-7", mem_nm: "한지우", section: "활동량", at: 81 },
];
