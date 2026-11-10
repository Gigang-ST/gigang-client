/**
 * 모임 공유 시트에 「단톡방에 알림」(노티봇 원버튼)을 세울지.
 *
 * - 팀이 노티봇을 써야 한다(카톡 공지방 `kakao.room_id` 가 있다). 없는 팀에 세우면 누를 때마다 "보낼 수 없어요"만 뜬다.
 * - 활동 멤버여야 한다 — 남의 모임도 된다. 비로그인·비활성·탈퇴는 안 된다.
 * - 지난 모임은 알리지 않는다.
 * 서버(`announceGatheringToKakao`)가 다시 판정하므로 이건 버튼을 보일지 정하는 안내값이다.
 * 회귀 테스트 `lib/gathering/__tests__/can-announce.test.ts`.
 */
export function canAnnounceToKakao(a: {
  kakaoAnnounce: boolean;
  currentMemberId?: string | null;
  viewerInactive?: boolean;
  isPastLocked: boolean;
}): boolean {
  return a.kakaoAnnounce && Boolean(a.currentMemberId) && !a.viewerInactive && !a.isPastLocked;
}
