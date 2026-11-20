import { describe, expect, it } from "vitest";

import {
  isProcessedFilterActive,
  parseProcessedFilter,
  processedFilterToQuery,
  processedPageCount,
} from "@/lib/dues/processed-filter";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("parseProcessedFilter", () => {
  it("빈 쿼리는 기본값", () => {
    expect(parseProcessedFilter({})).toEqual({ from: null, to: null, memId: null, itemCd: null, page: 1 });
  });

  it("정상 값을 읽는다", () => {
    const f = parseProcessedFilter({ pf: "2026-10-01", pt: "2026-10-31", pm: UUID, pi: "event_fee", pp: "3" });
    expect(f).toEqual({ from: "2026-10-01", to: "2026-10-31", memId: UUID, itemCd: "event_fee", page: 3 });
  });

  it("잘못된 값은 버린다", () => {
    const f = parseProcessedFilter({ pf: "2026-02-30", pt: "abc", pm: "x", pi: "a;b", pp: "-2" });
    expect(f).toEqual({ from: null, to: null, memId: null, itemCd: null, page: 1 });
  });

  it("거꾸로 된 기간은 뒤집는다", () => {
    const f = parseProcessedFilter({ pf: "2026-11-01", pt: "2026-10-01" });
    expect(f.from).toBe("2026-10-01");
    expect(f.to).toBe("2026-11-01");
  });

  it("배열 값은 첫 값", () => {
    expect(parseProcessedFilter({ pp: ["2", "5"] }).page).toBe(2);
  });
});

describe("processedFilterToQuery", () => {
  it("기본값은 싣지 않고 왕복한다", () => {
    expect(processedFilterToQuery(parseProcessedFilter({}))).toBe("");
    const f = parseProcessedFilter({ pf: "2026-10-01", pi: "due", pp: "2" });
    const q = new URLSearchParams(processedFilterToQuery(f));
    expect(parseProcessedFilter(Object.fromEntries(q))).toEqual(f);
  });
});

describe("보조", () => {
  it("쪽 수·필터 활성", () => {
    expect(processedPageCount(0)).toBe(1);
    expect(processedPageCount(50)).toBe(1);
    expect(processedPageCount(51)).toBe(2);
    expect(isProcessedFilterActive(parseProcessedFilter({ pp: "3" }))).toBe(false);
    expect(isProcessedFilterActive(parseProcessedFilter({ pi: "due" }))).toBe(true);
  });
});
