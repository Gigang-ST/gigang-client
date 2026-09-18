import { getCurrentMember } from "@/lib/queries/member";

import { NotificationChannel } from "@/components/notifications/notification-channel";

/**
 * 알림 채널의 **서버 쪽 관문** — 로그인 정체만 뽑아 클라이언트 채널에 넘긴다.
 *
 * 루트 레이아웃에 `<Suspense fallback={null}>`로 감싸 마운트한다. `PresenceLayerGate`·
 * 설치 배너와 **같은 자리, 같은 패턴**이다: `getCurrentMember()`가 쿠키를 읽으므로 자기
 * Suspense 경계에 가둬야 페이지 본문 렌더를 안 막는다.
 *
 * **여기서 알림을 조회하지 않는다.** 정체(mem_id)만 넘기고 목록·카운트는 클라이언트가
 * 마운트 뒤에 받는다 — 알림은 페이지 렌더와 무관해야 하기 때문이다.
 * `getCurrentMember`는 React cache라 각 페이지가 이미 부른 것과 중복 쿼리가 나지 않는다.
 *
 * **조회 실패를 격리한다.** 알림은 없어도 화면이 도는 부가 기능인데 이 컴포넌트는 **루트
 * 레이아웃**에 있어서, 여기서 던지면 오류 경계가 페이지 본문까지 삼킨다(Suspense는 대기를
 * 받아줄 뿐 오류를 막지 못한다 — `PresenceLayerGate`가 같은 이유로 `allSettled`를 쓴다).
 */
export async function NotificationChannelGate() {
  // ⚠️ **JSX를 try/catch 안에서 만들지 않는다.** 렌더는 지연되므로 그 안의 오류는 어차피
  // 여기서 안 잡히고, 린트(`react-hooks/error-boundaries`)가 막는다. 조회만 감싸고
  // JSX는 밖에서 만든다. (`PresenceLayerGate`가 `Promise.allSettled`를 쓰는 것과 같은 이유.)
  const [result] = await Promise.allSettled([getCurrentMember()]);

  if (result.status === "rejected") {
    // 삼키되 흔적은 남긴다 — 알림이 조용히 안 오는 원인을 나중에 추적할 수 있게.
    console.error("[notification] 멤버 조회 실패 — 채널 생략", result.reason);
    return null;
  }

  // 비로그인·미가입이면 채널을 붙이지 않는다(구독할 mem_id가 없다).
  const member = result.value.member;
  if (!member) return null;

  return <NotificationChannel memberId={member.id} />;
}
