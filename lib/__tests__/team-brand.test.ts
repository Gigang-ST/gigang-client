import { describe, expect, it } from "vitest";

import { buildHeaderBrand, hasHeaderBrand } from "@/lib/team-brand";

/**
 * 일정 탭 헤더의 팀 얼굴(창설일·슬로건) — 값이 없는 줄은 안 그리고, 둘 다 없으면 티커가 슬로건 면으로 안 넘어간다.
 */
describe("buildHeaderBrand", () => {
  it("창설일은 점 구분 날짜로 찍는다 — date 값이라 서버가 UTC 여도 하루 밀리지 않는다", () => {
    expect(buildHeaderBrand("2024-04-23", "No time to be weak")).toEqual({
      since: "2024.04.23",
      slogan: "No time to be weak",
    });
  });

  it("없는 값은 그 줄만 비운다", () => {
    expect(buildHeaderBrand(null, "Climb hard, run wild")).toEqual({ since: null, slogan: "Climb hard, run wild" });
  });

  it("둘 다 없으면 그릴 게 없다", () => {
    expect(hasHeaderBrand(buildHeaderBrand(null, null))).toBe(false);
    expect(hasHeaderBrand(buildHeaderBrand("2026-11-28", null))).toBe(true);
  });
});
