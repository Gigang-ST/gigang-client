import { describe, expect, it } from "vitest";

import { isAllSeasonMonthsAchieved, seasonMonths } from "@/lib/titles/mileage-months";

const snap = (base_dt: string, achv_yn: boolean) => ({ base_dt, achv_yn });

describe("seasonMonths", () => {
  it("시즌이 걸치는 달을 양 끝 포함해 나열한다", () => {
    expect(seasonMonths("2026-05-01", "2026-09-30")).toEqual([
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
    ]);
  });

  it("해를 넘긴다", () => {
    expect(seasonMonths("2026-11-15", "2027-02-01")).toEqual([
      "2026-11", "2026-12", "2027-01", "2027-02",
    ]);
  });

  it("뒤집힌 기간은 빈 배열", () => {
    expect(seasonMonths("2026-09-01", "2026-05-31")).toEqual([]);
  });
});

describe("isAllSeasonMonthsAchieved (마런정복자)", () => {
  const all5 = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"];

  it("시즌 전 달을 달성하면 true — 연습달(4월) 미달성은 무관", () => {
    const snaps = [snap("2026-04-01", false), ...all5.map((d) => snap(d, true))];
    expect(isAllSeasonMonthsAchieved("2026-05-01", "2026-09-30", snaps)).toBe(true);
  });

  it("한 달이라도 실패하면 false — 누적 횟수가 아니다", () => {
    const snaps = all5.map((d) => snap(d, d !== "2026-07-01"));
    expect(isAllSeasonMonthsAchieved("2026-05-01", "2026-09-30", snaps)).toBe(false);
  });

  it("중간 합류로 앞달 스냅샷이 없으면 false", () => {
    const snaps = ["2026-08-01", "2026-09-01"].map((d) => snap(d, true));
    expect(isAllSeasonMonthsAchieved("2026-05-01", "2026-09-30", snaps)).toBe(false);
  });

  it("시즌 길이가 5개월이 아니어도 기간을 따른다", () => {
    const three = ["2027-01-01", "2027-02-01", "2027-03-01"].map((d) => snap(d, true));
    expect(isAllSeasonMonthsAchieved("2027-01-01", "2027-03-31", three)).toBe(true);
    expect(isAllSeasonMonthsAchieved("2027-01-01", "2027-04-30", three)).toBe(false);
  });

  it("시즌 기간을 모르면 false", () => {
    expect(isAllSeasonMonthsAchieved(null, "2026-09-30", all5.map((d) => snap(d, true)))).toBe(false);
  });
});
