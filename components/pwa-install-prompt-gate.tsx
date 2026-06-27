import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

/**
 * 설치 배너 게이트.
 *
 * 설치 배너는 로그인 여부와 무관하게 미설치 모바일 웹에 노출한다(설치 자체는 비로그인도 가능).
 * 푸시 권한은 설치 후 PushPermissionPrompt가 별도로 유도한다.
 */
export function PwaInstallPromptGate() {
  return <PwaInstallPrompt variant="banner" />;
}
