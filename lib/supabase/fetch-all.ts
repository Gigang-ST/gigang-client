/**
 * PostgREST 응답 상한(1000행)을 넘어 **끝까지** 읽는다.
 *
 * ## 왜 이게 필요한가
 * PostgREST는 한 요청에 최대 `max_rows`(=1000, `supabase/config.toml`)행만 돌려주고,
 * 잘렸다는 **에러를 내지 않는다**. 그래서 결과가 틀려도 아무도 모른다 — 이 저장소에서만
 * 세 번 터졌다:
 * - 마일리지런 누적 로그 1,401건 중 401건이 잘려 환급 예정액이 낮게 계산(2026-08-27)
 * - 칭호 스냅샷의 마일리지 기록이 잘려 러닝원툴 등이 조용히 누락(#558)
 * - 관리자 대회 목록 1,115건 중 115건이 안 보여 수정·삭제 불가(2026-09-30 발견)
 *
 * ## 언제 써야 하나
 * **결과 행 수가 "시간이 갈수록" 늘어나는 조회**는 전부 이걸 쓴다 — 팀 전체·기간 전체를
 * 읽는 조회(참석·기록·취소·칭호 보유·알림…). 지금 몇 백 행이라도 쓴다. 한 사람 몫이거나
 * `.limit(n)`으로 일부러 자른 조회, `.single()`/`count: head`는 해당 없다.
 * 자세한 판단 기준은 `.claude/docs/coding-standards.md` §대량 조회.
 *
 * ## 쓰는 법
 * ```ts
 * const rows = await fetchAllRows(() =>
 *   db.from("gthr_attd_rel").select("mem_id, gthr_id").eq(...).order("attd_id"),
 * );
 * ```
 * - **쿼리를 만드는 함수**를 넘긴다(쿼리 빌더는 재사용할 수 없어 페이지마다 새로 만든다).
 * - `.range()`는 **붙이지 않는다** — 헬퍼가 붙인다. 호출부가 붙이게 하면 깜빡했을 때
 *   매 페이지가 같은 1000행을 받아 무한 루프가 된다.
 * - **정렬(`.order()`)은 필수이고 유일해야 한다**(PK 등). 정렬이 없거나 동률이 있으면
 *   페이지 경계에서 행이 겹치거나 빠진다. 정렬이 빠지면 실행 시 바로 던진다.
 *   `crt_at`처럼 겹칠 수 있는 키로 정렬하면 PK를 두 번째 정렬로 덧붙인다.
 * - 실패하면 **던진다**. 중간 페이지 실패를 0건으로 눙치면 뒤쪽 행이 또 조용히 빠진다.
 */

/** PostgREST `max_rows` — 이보다 작게 받으면 마지막 페이지다 */
export const POSTGREST_MAX_ROWS = 1000;

type PageResult<Row> = PromiseLike<{
  data: Row[] | null;
  error: { message: string } | null;
}>;

/** 정렬까지 걸린, 아직 `.range()`를 안 붙인 쿼리 */
export type PageableQuery<Row> = {
  range(from: number, to: number): PageResult<Row>;
};

/**
 * 정렬 없는 쿼리를 막는다. supabase-js 빌더는 요청 URL을 `url` 필드에 들고 있다 —
 * 그게 없는 객체(테스트용 가짜 DB 등)는 검사하지 않는다.
 */
function assertOrdered(query: unknown, label: string): void {
  const url = (query as { url?: unknown } | null)?.url;
  if (url instanceof URL && !url.searchParams.has("order")) {
    throw new Error(
      `fetchAllRows(${label}): 정렬(.order()) 없는 쿼리는 페이지 사이에 행이 겹치거나 빠진다 — 유일한 키로 정렬할 것`,
    );
  }
}

export async function fetchAllRows<Row>(
  build: () => PageableQuery<Row>,
  opts: { label?: string } = {},
): Promise<Row[]> {
  const label = opts.label ?? "query";
  const rows: Row[] = [];
  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const query = build();
    assertOrdered(query, label);
    const { data, error } = await query.range(from, from + POSTGREST_MAX_ROWS - 1);
    if (error) {
      throw new Error(`fetchAllRows(${label}) 조회 실패(from=${from}): ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < POSTGREST_MAX_ROWS) break;
  }
  return rows;
}
