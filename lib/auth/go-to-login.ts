"use client";

import {
  detectInAppBrowser,
  openExternalBrowser,
} from "@/components/in-app-browser-gate";

/**
 * 로그인 화면으로 보낸다 — **인앱브라우저면 바깥 브라우저로 열어서.**
 *
 * 이 분기가 핵심이다: 카카오톡·인스타 등 인앱브라우저 안에서는 OAuth 로그인이 막히거나
 * 돌아오지 못한다. 그래서 인앱이면 같은 주소를 **외부 브라우저로 띄워** 거기서 로그인시킨다
 * (`openExternalBrowser`가 iOS/안드로이드 방식을 갈라 처리한다).
 *
 * 이 세 줄이 댓글·대회 상세·대회 등록 세 곳에 복붙돼 있었다. 한 곳만 인앱 분기를 빠뜨려도
 * **카톡에서 들어온 사람만** 로그인이 안 되는데, 그건 개발자 브라우저에서 절대 재현되지 않는다
 * — 그래서 한 곳에 모은다.
 *
 * @param returnPath 로그인 후 돌아올 앱 내 경로(예: `/story`, `/schedule?comp=abc`).
 *                   생략하면 로그인 후 기본 위치로 간다.
 */
export function goToLogin(returnPath?: string): void {
  const next = returnPath
    ? `/auth/login?next=${encodeURIComponent(returnPath)}`
    : "/auth/login";

  if (detectInAppBrowser()) {
    // 외부 브라우저에는 상대경로를 넘길 수 없다 — 절대 URL로 만들어 준다.
    openExternalBrowser(window.location.origin + next);
    return;
  }
  window.location.href = next;
}
