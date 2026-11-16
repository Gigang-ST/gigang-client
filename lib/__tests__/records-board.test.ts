import { describe, expect, it } from "vitest";

import {
  TRIATHLON_EVENTS,
  defaultTriathlonEvent,
  getMyIndexStanding,
  getMyTimeStanding,
  pickTriathlonSplits,
  splitChampion,
  triathlonSplitKey,
  visibleTriathlonEvents,
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

  // 문구가 "1위보다"라 부호가 곧 방향이다 — 지수는 낮을수록 아래이므로 시간(`+`)과 반대다
  it("격차는 1위보다 얼마나 낮은지를 음수로 말한다", () => {
    expect(getMyIndexStanding(entries, "me")).toEqual({ rank: 3, value: "512", gap: "-106" });
  });

  it("내가 1위면 격차가 없다", () => {
    expect(getMyIndexStanding(entries, "a")?.gap).toBeNull();
  });
});

describe("철인3종 — 코스별 판 (#683)", () => {
  const ev = (eventType: string, male: unknown[] = [], female: unknown[] = []) => ({ eventType, male, female });
  const events = [
    ev("TRIATHLON_FULL"),
    ev("TRIATHLON_HALF", [{ name: "박정후" }], [{ name: "이도경" }]),
    ev("TRIATHLON_OLYMPIC_TY", [{ name: "강태오" }]),
    ev("TRIATHLON_OLYMPIC_ETC"),
    ev("TRIATHLON_SPRINT"),
  ];

  it("기록 있는 코스 + 킹만 탭으로 세운다 — 비어 있는 파생 칸·스프린트는 숨긴다", () => {
    expect(visibleTriathlonEvents(events).map((e) => e.eventType)).toEqual([
      "TRIATHLON_FULL",
      "TRIATHLON_HALF",
      "TRIATHLON_OLYMPIC_TY",
    ]);
  });

  it("스프린트도 기록이 생기면 탭이 선다", () => {
    const withSprint = events.map((e) => (e.eventType === "TRIATHLON_SPRINT" ? ev(e.eventType, [], [{}]) : e));
    expect(visibleTriathlonEvents(withSprint).map((e) => e.eventType)).toContain("TRIATHLON_SPRINT");
  });

  it("처음 열 코스는 기록이 있는 첫 코스 — 빈 킹을 먼저 열지 않는다", () => {
    expect(defaultTriathlonEvent(visibleTriathlonEvents(events))).toBe("TRIATHLON_HALF");
  });

  it("어느 코스에도 기록이 없으면 첫 코스(킹)를 연다", () => {
    expect(defaultTriathlonEvent([ev("TRIATHLON_FULL")])).toBe("TRIATHLON_FULL");
    expect(defaultTriathlonEvent([])).toBe("");
  });

  it("코스 탭 순서는 거리 내림차순이고 규격 거리를 갖는다", () => {
    expect(TRIATHLON_EVENTS.map((e) => e.label)).toEqual(["킹", "하프", "올림픽 · 통영", "올림픽", "스프린트"]);
    expect(TRIATHLON_EVENTS[0].legs).toEqual({ swim: "3.8", bike: "180.2", run: "42.2" });
  });
});

describe("철인 구간 기록", () => {
  it("구간이 하나라도 있으면 뽑고, 빈 구간은 null로 남긴다", () => {
    expect(pickTriathlonSplits({ swim_time_sec: 1930, bike_time_sec: null, run_time_sec: 6720 })).toEqual({
      swim: 1930,
      bike: null,
      run: 6720,
    });
  });

  it("셋 다 비었거나 0이면 null — 빈 격자를 세우지 않는다", () => {
    expect(pickTriathlonSplits({ swim_time_sec: null, bike_time_sec: null, run_time_sec: null })).toBeNull();
    expect(pickTriathlonSplits({ swim_time_sec: 0, bike_time_sec: 0, run_time_sec: 0 })).toBeNull();
  });

  it("랭킹 행과 원본 행을 사람·시간·대회 이름으로 잇는다", () => {
    expect(triathlonSplitKey("m1", 16882, "구미 70.3")).toBe(triathlonSplitKey("m1", 16882, "구미 70.3"));
    expect(triathlonSplitKey("m1", 16882, "구미 70.3")).not.toBe(triathlonSplitKey("m1", 16883, "구미 70.3"));
    expect(triathlonSplitKey("m1", 1, null)).toBe("m1|1|");
  });
});
