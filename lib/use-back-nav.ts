"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_BACK_HREF, resolveBackAction, type BackSignals } from "@/lib/back-nav";

/**
 * Navigation API의 `canGoBack`. `lib.dom.d.ts`에 아직 없어 여기서 좁게 선언한다.
 *
 * 전역 `Navigation` 인터페이스를 통째로 쓰지 않는 건, 우리가 필요한 게 이 불리언
 * 하나뿐이라서다 — 타입을 넓게 잡으면 실제로 안 쓰는 API 표면까지 떠안는다.
 */
type NavigationWithCanGoBack = { canGoBack?: boolean };

function readBackSignals(): BackSignals {
  const nav = (window as unknown as { navigation?: NavigationWithCanGoBack }).navigation;
  return {
    // 미지원 브라우저에서는 `undefined` — 판정이 길이 어림으로 물러난다.
    canGoBack: typeof nav?.canGoBack === "boolean" ? nav.canGoBack : undefined,
    historyLength: window.history.length,
  };
}

/**
 * "뒤로" 동작 하나. `router.back()`을 직접 부르는 대신 이걸 쓴다.
 *
 * 맨 `router.back()`은 히스토리가 비면 **조용히 아무 일도 안 한다**(#450). 헤더 화살표만
 * 고쳐 두면 같은 화면의 `취소` 버튼이나 저장 후 복귀가 여전히 먹통이라, 헤더는 되는데
 * 그 옆 버튼은 안 되는 상태가 된다.
 *
 * 판정은 클릭 시점에 한다 — 서버는 히스토리를 몰라서, 렌더에서 가르면 하이드레이션이
 * 어긋난다. 판정 자체는 `lib/back-nav.ts`에 순수 함수로 있고 테스트가 지킨다.
 */
export function useBackNav(fallbackHref: string = DEFAULT_BACK_HREF) {
  const router = useRouter();

  return useCallback(() => {
    const action = resolveBackAction(readBackSignals(), fallbackHref);
    if (action.type === "back") {
      router.back();
      return;
    }
    // push가 아니라 replace — 갈 곳 없던 항목을 스택에 더 쌓지 않는다.
    router.replace(action.href);
  }, [router, fallbackHref]);
}
