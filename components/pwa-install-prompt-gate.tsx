import { getTeamCopy } from "@/lib/queries/team-copy";

import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

/**
 * 설치 배너 게이트.
 *
 * 설치 배너는 로그인 여부와 무관하게 미설치 모바일 웹에 노출한다(설치 자체는 비로그인도 가능).
 * 푸시 권한은 설치 후 PushPermissionPrompt가 별도로 유도한다.
 *
 * 안내 제목이 팀마다 달라(§lib/team-copy) 요청 주소를 읽는다 — 루트 레이아웃의 **Suspense 안**에 있어 정적 셸은 그대로다.
 * 팀을 못 읽으면(등록 안 된 주소 — proxy 가 먼저 끊어 보통 안 온다) 배너를 안 세운다(다른 팀 문구로 물러나지 않는다).
 */
export async function PwaInstallPromptGate() {
  let title: string;
  try {
    title = (await getTeamCopy()).installPromptTitle;
  } catch {
    return null;
  }
  return <PwaInstallPrompt variant="banner" title={title} />;
}
