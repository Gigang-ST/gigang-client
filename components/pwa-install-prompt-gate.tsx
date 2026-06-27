import { getCurrentMember } from "@/lib/queries/member";

import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

/**
 * 설치 배너 + 로그인 여부 조회를 묶은 서버 컴포넌트.
 *
 * 로그인 여부(loggedIn)는 설치 거부 후 Android 알림 폴백을 멤버에게만 적용하기 위해 필요한데,
 * cookies() 의존 조회를 루트 layout 본문에서 직접 하면 페이지 전체 렌더가 막힌다.
 * 이 컴포넌트를 <Suspense>로 감싸 조회를 경계 안에 가둔다(본문은 즉시 렌더).
 */
export async function PwaInstallPromptGate() {
  let loggedIn = false;
  try {
    const { member } = await getCurrentMember();
    loggedIn = member !== null;
  } catch {
    loggedIn = false;
  }

  return <PwaInstallPrompt variant="banner" loggedIn={loggedIn} />;
}
