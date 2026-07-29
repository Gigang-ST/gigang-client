/**
 * Supabase 조회 결과의 `error`가 "요청 중단(abort)"인지 판정한다.
 *
 * 왜 필요한가 — 두 경우에 supabase-js가 중단된 fetch를 **throw 하지 않고** `error` 객체로
 * 정규화해 돌려준다. 둘 다 코드 결함이 아니라 정상 취소라 로그에 남길 가치가 없다:
 *   1. **dev + cacheComponents 렌더 재시작** — 캐시 미스 시 Next가 렌더를 abort하고 다시 그린다
 *      (`renderWithRestartOnCacheMissInDev`, dev 런타임 전용). 진행 중이던 uncached fetch가 함께 끊긴다.
 *   2. **운영의 실제 요청 취소/타임아웃** — 유저가 렌더 도중 이탈하거나 연결이 끊기면 요청이 취소된다.
 *
 * 그래서 조회부는 "abort면 조용히 폴백, 그 외(RPC 없음·RLS 거부·SQL 오류 등)만 `console.error`"로
 * 가른다. 판정 문자열은 여기 한 곳에 가둬, 이후 Next/Supabase가 메시지를 바꿔도 이 함수만 손보면 된다.
 *
 * abort 에러의 실제 형태: `{ message: "AbortError: This operation was aborted",
 * hint: "Request was aborted (timeout or manual cancellation)", ... }`.
 */
export function isRequestAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string; hint?: string };
  const haystack = `${e.name ?? ""} ${e.message ?? ""} ${e.hint ?? ""}`.toLowerCase();
  return haystack.includes("abort");
}
