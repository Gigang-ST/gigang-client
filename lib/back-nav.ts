/**
 * 뒤로가기 버튼이 실제로 무엇을 할지 정하는 판정.
 *
 * `router.back()`은 **갈 곳이 없으면 조용히 아무 일도 안 한다.** 북마크·알림 딥링크·
 * 새 탭으로 `(info)` 잎사귀 화면에 직접 들어오면 히스토리가 비어 있어 화살표가 먹통이
 * 된다(#450). 예전엔 `/mcp-tokens` 한 경로만 `href`를 강제해 우회했는데(#447),
 * 그러면 정상 진입에서도 항상 같은 곳으로 가버려 "뒤로"라는 말과 어긋난다.
 *
 * 그래서 **판정은 클릭 시점에** 한다: 돌아갈 데가 있으면 진짜 뒤로 가고, 없을 때만
 * 안전한 기본 경로로 보낸다.
 *
 * 판정 근거가 `window.history.length` 하나인 건 App Router가 다른 걸 안 주기 때문이다 —
 * Next 16의 history state에는 내비게이션 인덱스가 없고(`__NA`·`__PRIVATE_NEXTJS_INTERNALS_TREE`
 * 뿐), 최초 로드가 `replaceState`라 `__NA`는 직접 진입에도 붙어 있어 둘 다 판별에 못 쓴다.
 *
 * 한계는 알고 쓴다: 외부 사이트를 거쳐 들어오면 `length > 1`이라 뒤로가기가 앱 밖으로
 * 나간다. 그건 브라우저 뒤로가기의 정상 동작이라 여기서 막지 않는다. 이 판정이 고치는
 * 것은 **아무 일도 일어나지 않는** 경우다.
 */
export type BackAction = { type: "back" } | { type: "replace"; href: string };

/** 히스토리에 항목이 하나뿐이면(=이 문서가 시작점) 돌아갈 곳이 없다. */
export function resolveBackAction(historyLength: number, fallbackHref: string): BackAction {
  if (historyLength > 1) return { type: "back" };
  return { type: "replace", href: fallbackHref };
}

/** 뒤로가기 기본 목적지. 어느 화면에서든 안전한 지면. */
export const DEFAULT_BACK_HREF = "/";
