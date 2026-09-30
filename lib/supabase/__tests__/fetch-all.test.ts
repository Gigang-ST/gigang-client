import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { fetchAllRows, POSTGREST_MAX_ROWS } from "@/lib/supabase/fetch-all";

/** 전체 행을 들고, range 요청마다 그 구간만 돌려주는 가짜 쿼리 — 실제 PostgREST처럼 max_rows에서 자른다 */
function fakeTable(total: number, failAt?: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const build = () => ({
    range(from: number, to: number) {
      calls.push([from, to]);
      if (failAt !== undefined && from >= failAt) {
        return Promise.resolve({ data: null, error: { message: "boom" } });
      }
      const end = Math.min(to + 1, from + POSTGREST_MAX_ROWS);
      return Promise.resolve({ data: all.slice(from, end), error: null });
    },
  });
  return { build, calls };
}

describe("fetchAllRows", () => {
  it("1000행을 넘으면 페이지를 넘겨 끝까지 읽는다", async () => {
    const t = fakeTable(2345);
    const rows = await fetchAllRows(t.build);
    expect(rows).toHaveLength(2345);
    expect(rows.at(-1)).toEqual({ id: 2344 });
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("정확히 1000행이면 빈 페이지를 한 번 더 보고 멈춘다", async () => {
    const t = fakeTable(1000);
    expect(await fetchAllRows(t.build)).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it("1000행 미만이면 한 번만 읽는다", async () => {
    const t = fakeTable(3);
    expect(await fetchAllRows(t.build)).toHaveLength(3);
    expect(t.calls).toHaveLength(1);
  });

  it("⚠️ 중간 페이지 실패를 0건으로 눙치지 않고 던진다 — 뒤쪽 행이 조용히 빠지는 게 이 헬퍼가 막는 사고다", async () => {
    const t = fakeTable(2500, 1000);
    await expect(fetchAllRows(t.build, { label: "테스트" })).rejects.toThrow(
      /테스트.*from=1000.*boom/,
    );
  });

  describe("정렬 강제 — 실제 supabase-js 빌더로 확인", () => {
    // 네트워크는 타지 않는다: 정렬 검사는 요청을 보내기 전에 던진다
    const db = createClient("http://localhost:54321", "anon");

    it("정렬 없는 쿼리는 요청 전에 던진다", async () => {
      await expect(
        fetchAllRows(() => db.from("gthr_attd_rel").select("mem_id"), { label: "무정렬" }),
      ).rejects.toThrow(/무정렬.*정렬/);
    });
  });
});
