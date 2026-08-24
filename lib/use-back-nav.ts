"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_BACK_HREF, resolveBackAction } from "@/lib/back-nav";

/**
 * "뒤로" 동작 하나. `router.back()`을 직접 부르는 대신 이걸 쓴다.
 *
 * 맨 `router.back()`은 히스토리가 비면 **조용히 아무 일도 안 한다**(#450). 헤더 화살표만
 * 고쳐 두면 같은 화면의 `취소` 버튼이나 저장 후 복귀가 여전히 먹통이라, 헤더는 되는데
 * 그 옆 버튼은 안 되는 상태가 된다.
 *
 * 판정은 클릭 시점에 한다 — 서버는 히스토리 길이를 몰라서, 렌더에서 가르면 하이드레이션이
 * 어긋난다. 판정 자체는 `lib/back-nav.ts`에 순수 함수로 있고 테스트가 지킨다.
 */
export function useBackNav(fallbackHref: string = DEFAULT_BACK_HREF) {
  const router = useRouter();

  return useCallback(() => {
    const action = resolveBackAction(window.history.length, fallbackHref);
    if (action.type === "back") {
      router.back();
      return;
    }
    // push가 아니라 replace — 갈 곳 없던 항목을 스택에 더 쌓지 않는다.
    router.replace(action.href);
  }, [router, fallbackHref]);
}
