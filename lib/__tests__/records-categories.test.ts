import { describe, expect, it } from "vitest";

import { visibleRecordCategories } from "@/lib/records-categories";

/** 전당 종목 — 팀 설정에 둔 순서 그대로 탭이 선다(위에 둔 종목이 먼저) */
describe("visibleRecordCategories", () => {
  it("고른 순서 그대로", () => {
    expect(visibleRecordCategories(["trail", "marathon"])).toEqual(["trail", "marathon"]);
  });

  it("모르는 값·겹친 값은 뺀다", () => {
    expect(visibleRecordCategories(["hyrox", "ski", "hyrox"])).toEqual(["hyrox"]);
  });

  it("하나도 안 남으면 넷 다 정본 순서로 — 랭킹탭이 텅 비지 않게", () => {
    expect(visibleRecordCategories([])).toEqual(["marathon", "trail", "triathlon", "hyrox"]);
  });
});
