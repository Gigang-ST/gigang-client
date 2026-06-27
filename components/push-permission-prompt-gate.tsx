import { getCurrentMember } from "@/lib/queries/member";

import { PushPermissionPrompt } from "@/components/push-permission-prompt";

/**
 * 푸시 권한 soft prompt + 로그인 여부 조회를 묶은 서버 컴포넌트.
 *
 * (main) 레이아웃은 비로그인도 접근 가능한 홈을 포함하므로, 권한 배너를 무조건 띄우면
 * 비로그인 사용자에게도 권한 요청이 뜬다. 허용해도 구독 저장(withMember)이 거부돼
 * "권한은 granted인데 구독은 없는" 반쪽 상태가 되므로, 로그인 멤버에게만 노출한다.
 * cookies() 의존 조회는 <Suspense> 경계 안에 둬 페이지 본문 렌더를 막지 않는다.
 */
export async function PushPermissionPromptGate() {
  let loggedIn = false;
  try {
    const { member } = await getCurrentMember();
    loggedIn = member !== null;
  } catch {
    loggedIn = false;
  }

  return <PushPermissionPrompt loggedIn={loggedIn} />;
}
