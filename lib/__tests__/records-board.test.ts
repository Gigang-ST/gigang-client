import { describe, expect, it } from "vitest";

import {
  flattenTriathlon,
  getEmptyTriathlonSlots,
  getMyIndexStanding,
  getMyTimeStanding,
  splitChampion,
} from "@/lib/records-board";

const time = (rank: number, memId: string, recordSec: number) => ({
  rank,
  memId,
  record: `${recordSec}s`,
  recordSec,
});

describe("splitChampion", () => {
  it("1위를 떼고 나머지를 순서대로 남긴다", () => {
    const { champion, rest } = splitChampion([time(1, "a", 100), time(2, "b", 120), time(3, "c", 130)]);
    expect(champion?.memId).toBe("a");
    expect(rest.map((r) => r.memId)).toEqual(["b", "c"]);
  });

  it("빈 목록이면 챔피언도 없다 — 빈 띠만 세우지 않는다", () => {
    expect(splitChampion([])).toEqual({ champion: null, rest: [] });
  });

  it("한 명뿐이면 챔피언만 남고 목록은 빈다", () => {
    const { champion, rest } = splitChampion([time(1, "a", 100)]);
    expect(champion?.memId).toBe("a");
    expect(rest).toEqual([]);
  });
});

describe("getMyTimeStanding — 짧을수록 상위", () => {
  const entries = [time(1, "a", 4961), time(2, "b", 5107), time(3, "me", 5804)];

  it("1위와의 격차를 +시간으로 준다", () => {
    expect(getMyTimeStanding(entries, "me")).toEqual({
      rank: 3,
      value: "5804s",
      gap: "+14:03",
    });
  });

  it("내가 1위면 격차가 없다", () => {
    expect(getMyTimeStanding(entries, "a")?.gap).toBeNull();
  });

  it("1위와 동타면 격차를 +0:00으로 찍지 않는다", () => {
    const tied = [time(1, "a", 4961), time(2, "me", 4961)];
    expect(getMyTimeStanding(tied, "me")?.gap).toBeNull();
  });

  it("비로그인·목록에 없음·빈 목록이면 판독선을 세우지 않는다", () => {
    expect(getMyTimeStanding(entries, null)).toBeNull();
    expect(getMyTimeStanding(entries, "nobody")).toBeNull();
    expect(getMyTimeStanding([], "me")).toBeNull();
  });
});

describe("getMyIndexStanding — 클수록 상위", () => {
  const entries = [
    { rank: 1, memId: "a", utmbIndex: 618 },
    { rank: 2, memId: "b", utmbIndex: 574 },
    { rank: 3, memId: "me", utmbIndex: 512 },
  ];

  it("격차 부호가 시간과 반대로 뒤집히지 않는다", () => {
    expect(getMyIndexStanding(entries, "me")).toEqual({ rank: 3, value: "512", gap: "106" });
  });

  it("내가 1위면 격차가 없다", () => {
    expect(getMyIndexStanding(entries, "a")?.gap).toBeNull();
  });
});

describe("철인3종 — 순위가 아니라 명단", () => {
  const events = [
    { eventType: "TRIATHLON_FULL", entries: [] },
    { eventType: "TRIATHLON_HALF", entries: [{ name: "박정후" }, { name: "이도경" }] },
    { eventType: "TRIATHLON_OLYMPIC_TY", entries: [{ name: "강태오" }] },
    { eventType: "TRIATHLON_OLYMPIC_ETC", entries: [] },
  ];

  it("종목 순서를 유지한 채 한 명단으로 펴고 칩을 붙인다", () => {
    expect(flattenTriathlon(events)).toEqual([
      { chip: "하프", entry: { name: "박정후" } },
      { chip: "하프", entry: { name: "이도경" } },
      { chip: "올림픽 · 통영", entry: { name: "강태오" } },
    ]);
  });

  it("빈 점선 칸은 킹만 — 올림픽 파생 칸은 비어도 세우지 않는다", () => {
    expect(getEmptyTriathlonSlots(events)).toEqual([{ eventType: "TRIATHLON_FULL", chip: "킹" }]);
  });

  it("킹에 완주자가 생기면 점선 칸이 사라진다", () => {
    const withKing = events.map((e) =>
      e.eventType === "TRIATHLON_FULL" ? { ...e, entries: [{ name: "첫 완주자" }] } : e,
    );
    expect(getEmptyTriathlonSlots(withKing)).toEqual([]);
  });
});
