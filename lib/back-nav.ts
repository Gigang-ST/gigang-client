/**
 * 뒤로가기 버튼이 실제로 무엇을 할지 정하는 판정.
 *
 * `router.back()`은 **갈 곳이 없으면 조용히 아무 일도 안 한다.** 북마크·알림 딥링크·
 * 새 탭으로 잎사귀 화면에 직접 들어오면 화살표가 먹통이 된다(#450). 그래서 돌아갈 데가
 * 있으면 진짜 뒤로 가고, 없을 때만 안전한 기본 경로로 보낸다.
 */
export type BackAction = { type: "back" } | { type: "replace"; href: string };

/**
 * 판정에 쓰는 신호. 브라우저에서 읽어 넣는다(§`lib/use-back-nav.ts`).
 *
 * 둘을 나눠 받는 건 **정확도가 다르기 때문**이다.
 */
export type BackSignals = {
  /**
   * `window.navigation.canGoBack` — **정확한 답**. 뒤에 항목이 있는지를 그대로 알려준다.
   * 지원하지 않는 브라우저에서는 `undefined`로 들어온다.
   */
  canGoBack?: boolean;
  /**
   * `window.history.length` — **앞뒤를 합친 전체 길이**라 뒤쪽만 따로 알 수 없다.
   * `canGoBack`이 없을 때만 쓰는 차선책이다.
   */
  historyLength: number;
};

/**
 * `canGoBack`이 있으면 그것만 믿고, 없으면 길이로 어림한다.
 *
 * ⚠️ **길이 어림은 완전하지 않다.** `history.length`는 앞으로 갈 항목까지 세므로,
 * 첫 항목으로 되돌아온 상태(뒤는 비었고 앞만 남은 경우)를 "뒤가 있다"로 오판한다.
 *
 * ```
 * /board 직접 진입   → length 1, 현재 0번
 * 글로 이동          → length 2, 현재 1번
 * 브라우저 뒤로      → length 2, 현재 0번   ← 뒤는 비었는데 length 는 2
 * ```
 *
 * 이때 `back()`은 또 아무 일도 안 한다. `canGoBack`이 있는 브라우저에서는 이 구멍이
 * 없고, 없는 곳에서는 남는다 — 고치려면 Next 내부 히스토리 처리에 손대야 하는데
 * (App Router 는 history state 에 인덱스를 안 남긴다) 그 값은 아니라고 봤다.
 *
 * 외부 사이트를 거쳐 들어온 경우 뒤로가기가 앱 밖으로 나가는 건 **막지 않는다.**
 * 그건 브라우저 뒤로가기의 정상 동작이다. 여기서 고치는 것은 **아무 일도 일어나지
 * 않는** 경우뿐이다.
 */
export function resolveBackAction(signals: BackSignals, fallbackHref: string): BackAction {
  const { canGoBack, historyLength } = signals;

  if (canGoBack !== undefined) {
    return canGoBack ? { type: "back" } : { type: "replace", href: fallbackHref };
  }

  return historyLength > 1 ? { type: "back" } : { type: "replace", href: fallbackHref };
}

/** 뒤로가기 기본 목적지. 어느 화면에서든 안전한 지면. */
export const DEFAULT_BACK_HREF = "/";
