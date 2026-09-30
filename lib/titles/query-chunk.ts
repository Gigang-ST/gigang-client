import { fetchAllRows, type PageableQuery } from "@/lib/supabase/fetch-all";

/**
 * `.in(col, ids)` 목록을 나눠 조회하고 합친다.
 *
 * **왜 필요한가**: PostgREST는 필터를 URL 쿼리스트링에 싣는다. `.in()`에 UUID 수천 개를
 * 넣으면 URL이 수백 KB가 되어 요청이 거부되는데, 이 저장소의 조회부는 대체로 `error`를
 * 안 보고 `data ?? []`로 떨어지므로 **결과가 0건으로 조용히 바뀐다**. 칭호로 치면
 * "조건을 채웠는데 안 붙는다"이고, 원인을 찾기가 매우 어렵다.
 *
 * **지금 당장 급한 문제는 아니다** — prd 실측 최대치는 멤버당 댓글 72 · 글 18 · 대회 16이라
 * 한참 여유가 있다. 다만 이 값들은 **시간이 갈수록 단조 증가**하고(누적 조건이라 창을 안
 * 좁힌다), 한계에 닿는 순간이 정확히 "활동을 가장 많이 한 사람"이라 가장 억울한 형태로
 * 터진다. 상한을 두는 비용이 이 정도면 미리 둔다.
 *
 * **청크 하나도 1000행을 넘을 수 있다** — id 200개 × 모임당 참석자·글당 댓글이면 금방이다.
 * 그래서 청크마다 {@link fetchAllRows}로 끝까지 읽는다. `run`은 `.range()` 없이
 * **유일한 키로 정렬된** 쿼리를 돌려줘야 한다(`crt_at`처럼 겹칠 수 있으면 PK를 덧붙인다).
 * 실패하면 던진다 — 예전엔 `data`만 보고 에러를 삼켜 "조건 불충족"으로 조용히 끝났다.
 *
 * ⚠️ **정렬이 필요한 조회에 쓸 때**: 청크마다 따로 정렬되므로 **전역 순서는 보장되지 않는다.**
 * 쓰는 쪽이 "키별로 첫 행"처럼 **같은 키의 행이 한 청크 안에 모이는** 계산일 때만 안전하다
 * (`in`에 넘긴 id가 곧 그 키이므로 성립한다). 전역 정렬이 필요하면 이걸 쓰지 말 것.
 */
const IN_CHUNK_SIZE = 200;

export async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PageableQuery<unknown>,
): Promise<T[]> {
  if (!ids.length) return [];

  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    const rows = await fetchAllRows(() => run(chunk), { label: "selectInChunks" });
    out.push(...(rows as T[]));
  }
  return out;
}
