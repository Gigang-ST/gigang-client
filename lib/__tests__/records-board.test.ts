import { describe, expect, it } from "vitest";

import {
  TRIATHLON_EVENTS,
  buildTriathlonBoards,
  defaultTriathlonEvent,
  getMyIndexStanding,
  getMyTimeStanding,
  pickTriathlonSplits,
  splitChampion,
  triathlonSeriesLabel,
  triathlonSplitKey,
  type TriathlonRankRow,
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

describe("철인3종 — 코스 탭 (#683)", () => {
  it("코스 탭은 킹 · 하프 · 올림픽 셋으로 고정이고, 대회 칩은 올림픽만", () => {
    expect(TRIATHLON_EVENTS.map((e) => e.label)).toEqual(["킹", "하프", "올림픽"]);
    expect(TRIATHLON_EVENTS.filter((e) => e.bySeries).map((e) => e.eventType)).toEqual(["TRIATHLON_OLYMPIC"]);
    expect(TRIATHLON_EVENTS[0].legs).toEqual({ swim: "3.8", bike: "180.2", run: "42.2" });
  });

  it("처음 열 코스는 기록이 있는 첫 코스 — 빈 킹을 먼저 열지 않는다", () => {
    const ev = (eventType: string, n: number) => ({ eventType, male: Array(n).fill({}), female: [] });
    expect(defaultTriathlonEvent([ev("TRIATHLON_FULL", 0), ev("TRIATHLON_HALF", 0), ev("TRIATHLON_OLYMPIC", 2)])).toBe(
      "TRIATHLON_OLYMPIC",
    );
    expect(defaultTriathlonEvent([ev("TRIATHLON_FULL", 0)])).toBe("TRIATHLON_FULL");
    expect(defaultTriathlonEvent([])).toBe("");
  });
});

describe("철인 대회 묶음 이름 — 같은 대회 시리즈를 한 칩으로", () => {
  it("대회 지역(loc_nm)이 있으면 그것 — 행정 단위 접미사는 뗀다", () => {
    expect(triathlonSeriesLabel({ loc_nm: "통영", comp_nm: "2024 통영 월드 트라이애슬론 컵" })).toBe("통영");
    expect(triathlonSeriesLabel({ loc_nm: "통영시", comp_nm: "2025 통영 월드 트라이애슬론 컵" })).toBe("통영");
    expect(triathlonSeriesLabel({ loc_nm: "충주시 탄금호", comp_nm: "x" })).toBe("충주");
  });

  it("지역이 없으면 대회 이름에서 연도·회차를 걷고 첫 낱말", () => {
    expect(triathlonSeriesLabel({ loc_nm: null, comp_nm: "제6회 창원특례시 마산만 전국 트라이애슬론 대회" })).toBe("창원");
    expect(triathlonSeriesLabel({ loc_nm: "", comp_nm: "2025년 대구 트라이애슬론" })).toBe("대구");
  });

  it("떼고 한 글자만 남는 지명은 그대로 둔다(대구 → 대 가 되지 않게)", () => {
    expect(triathlonSeriesLabel({ loc_nm: "대구", comp_nm: "" })).toBe("대구");
  });

  it("뽑을 게 없으면 null", () => {
    expect(triathlonSeriesLabel({ loc_nm: null, comp_nm: "2025 제3회" })).toBeNull();
    expect(triathlonSeriesLabel({})).toBeNull();
  });
});

describe("buildTriathlonBoards — 코스별·대회별 판", () => {
  const row = (memId: string, gender: string, evtCd: string, recordSec: number, raceName: string): TriathlonRankRow => ({
    memId,
    name: memId,
    gender,
    evtCd,
    recordSec,
    raceName,
  });
  const rows = [
    row("a", "male", "TRIATHLON_OLYMPIC", 9600, "2024 통영 월드 트라이애슬론 컵"),
    row("a", "male", "TRIATHLON_OLYMPIC", 9000, "2025 통영 월드 트라이애슬론 컵"),
    row("b", "male", "TRIATHLON_OLYMPIC", 8800, "제6회 창원특례시 마산만 전국 트라이애슬론 대회"),
    row("b", "male", "TRIATHLON_OLYMPIC", 9900, "2025 통영 월드 트라이애슬론 컵"),
    row("c", "female", "TRIATHLON_OLYMPIC", 10000, "알 수 없는 대회"),
    row("k", "male", "TRIATHLON_FULL", 48540, "2026 구례 아이언맨대회"),
    row("s", "male", "TRIATHLON_SPRINT", 4000, "스프린트 대회"),
  ];
  const series: Record<string, string> = {
    "2024 통영 월드 트라이애슬론 컵": "통영",
    "2025 통영 월드 트라이애슬론 컵": "통영",
    "제6회 창원특례시 마산만 전국 트라이애슬론 대회": "창원",
  };
  const boards = buildTriathlonBoards(rows, (r) => ({
    splits: r.memId === "a" && r.recordSec === 9000 ? { swim: 1800, bike: null, run: null } : null,
    series: series[r.raceName ?? ""] ?? null,
  }));
  const olympic = boards.find((b) => b.eventType === "TRIATHLON_OLYMPIC")!;

  it("코스 셋만 만든다 — 스프린트 기록은 어느 판에도 서지 않는다", () => {
    expect(boards.map((b) => b.eventType)).toEqual(["TRIATHLON_FULL", "TRIATHLON_HALF", "TRIATHLON_OLYMPIC"]);
    expect(boards.flatMap((b) => [...b.male, ...b.female]).some((e) => e.memId === "s")).toBe(false);
  });

  it("전체 판은 한 사람의 가장 빠른 기록 하나로 순위를 매긴다", () => {
    expect(olympic.male.map((e) => [e.rank, e.memId, e.recordSec])).toEqual([
      [1, "b", 8800],
      [2, "a", 9000],
    ]);
    expect(olympic.female.map((e) => e.memId)).toEqual(["c"]);
  });

  it("대회별 판은 연도가 달라도 같은 대회를 한 묶음으로 — 그 대회 안의 최고 기록으로 다시 순위", () => {
    const ty = olympic.series.find((s) => s.label === "통영")!;
    expect(ty.male.map((e) => [e.rank, e.memId, e.recordSec])).toEqual([
      [1, "a", 9000],
      [2, "b", 9900],
    ]);
  });

  it("묶음은 완주자 많은 순, 이름을 못 뽑은 대회는 맨 끝 「기타」", () => {
    expect(olympic.series.map((s) => s.label)).toEqual(["통영", "창원", "기타"]);
  });

  it("구간 기록은 그 사람의 그 기록에 붙는다", () => {
    expect(olympic.series.find((s) => s.label === "통영")!.male[0].splits).toEqual({ swim: 1800, bike: null, run: null });
  });

  it("킹·하프는 대회별 판을 만들지 않는다", () => {
    expect(boards.find((b) => b.eventType === "TRIATHLON_FULL")!.series).toEqual([]);
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
