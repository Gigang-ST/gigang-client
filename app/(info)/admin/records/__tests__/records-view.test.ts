import { describe, expect, it } from "vitest";

import {
  ALL,
  eventOptions,
  filterRecords,
  findRecordIssues,
  isSportMismatch,
  periodOptions,
  sortRecords,
  timeIssue,
  type AdminRecordRow,
} from "@/app/(info)/admin/records/records-view";

const H = 3600;

function row(p: Partial<AdminRecordRow> & { id: string }): AdminRecordRow {
  return {
    memId: "m1",
    memNm: "홍길동",
    compId: `c-${p.id}`,
    sprtCd: "road_run",
    evtCd: "FULL",
    eventLabel: "로드 런 · FULL",
    recordTimeSec: 4 * H,
    raceName: "서울마라톤",
    raceDate: "2026-03-15",
    createdAt: "2026-03-20T00:00:00+00:00",
    ...p,
  };
}

describe("timeIssue — 종목 대비 비현실적 시간", () => {
  it("풀코스 2시간 미만은 너무 빠름, 7시간 초과는 너무 느림", () => {
    expect(timeIssue("road_run", "FULL", 1.9 * H)?.kind).toBe("too_fast");
    expect(timeIssue("road_run", "FULL", 2 * H)).toBeNull();
    expect(timeIssue("road_run", "FULL", 7.5 * H)?.kind).toBe("too_slow");
  });

  it("10K 25분 미만은 너무 빠름", () => {
    expect(timeIssue("road_run", "10K", 24 * 60)?.kind).toBe("too_fast");
    expect(timeIssue("road_run", "10K", 45 * 60)).toBeNull();
  });

  it("철인 FULL 은 마라톤 기준으로 재지 않는다(#581)", () => {
    expect(timeIssue("triathlon", "FULL", 12 * H)).toBeNull();
    expect(timeIssue("triathlon", "FULL", 4 * H)?.kind).toBe("too_fast");
    expect(timeIssue("triathlon", "TRIATHLON_FULL", 12 * H)).toBeNull();
  });

  it("스포츠를 모르는 FULL 은 판정하지 않는다(철인일 수도 있다)", () => {
    expect(timeIssue(null, "FULL", 12 * H)).toBeNull();
  });

  it("하이록스 오픈 50분 미만", () => {
    expect(timeIssue("hyrox", "OPEN", 40 * 60)?.kind).toBe("too_fast");
    expect(timeIssue("hyrox", "OPEN", 80 * 60)).toBeNull();
  });

  it("트레일·울트라 거리 종목은 2'30\"/km 보다 빠르면 걸린다, 느린 쪽은 안 본다", () => {
    expect(timeIssue("trail_run", "50K", 2 * H)?.kind).toBe("too_fast");
    expect(timeIssue("trail_run", "50K", 20 * H)).toBeNull();
    // 사이클 80K 를 달리기 페이스로 재지 않는다
    expect(timeIssue("cycling", "80K", 2 * H)).toBeNull();
  });
});

describe("isSportMismatch — 대회 스포츠와 종목 코드", () => {
  it("로드 런 대회에 철인 코드", () => {
    expect(isSportMismatch("road_run", "OLYMPIC")).toBe(true);
    expect(isSportMismatch("road_run", "FULL")).toBe(false);
  });

  it("거리로 적은 직접 입력 코드와 처음 보는 코드는 불일치로 보지 않는다", () => {
    expect(isSportMismatch("road_run", "32K")).toBe(false);
    expect(isSportMismatch("trail_run", "37K")).toBe(false);
    expect(isSportMismatch("road_run", "RELAY 4X5")).toBe(false);
  });

  it("하이록스는 부문 코드만(#671)", () => {
    expect(isSportMismatch("hyrox", "OPEN")).toBe(false);
    expect(isSportMismatch("hyrox", "HYROX_DOUBLES")).toBe(false);
    expect(isSportMismatch("hyrox", "OPEN SINGLE")).toBe(true);
    expect(isSportMismatch("hyrox", "PRO")).toBe(true);
  });

  it("사이클 대회에 마라톤 코드", () => {
    expect(isSportMismatch("cycling", "FULL")).toBe(true);
  });

  it("스포츠를 모르면 판정하지 않는다", () => {
    expect(isSportMismatch(null, "OLYMPIC")).toBe(false);
  });
});

describe("findRecordIssues", () => {
  it("같은 회원·대회·종목은 두 줄 모두 중복", () => {
    const rows = [
      row({ id: "a", compId: "c1" }),
      row({ id: "b", compId: "c1" }),
      row({ id: "c", compId: "c1", memId: "m2" }),
      row({ id: "d", compId: "c1", evtCd: "HALF", eventLabel: "로드 런 · HALF", recordTimeSec: 1.8 * H }),
    ];
    const issues = findRecordIssues(rows);
    expect(issues.get("a")?.map((i) => i.kind)).toEqual(["duplicate"]);
    expect(issues.get("b")?.map((i) => i.kind)).toEqual(["duplicate"]);
    expect(issues.has("c")).toBe(false);
    expect(issues.has("d")).toBe(false);
  });

  it("철인 FULL 과 옛 TRIATHLON_FULL 은 같은 종목으로 본다", () => {
    const rows = [
      row({ id: "a", compId: "c1", sprtCd: "triathlon", evtCd: "FULL", recordTimeSec: 12 * H }),
      row({ id: "b", compId: "c1", sprtCd: "triathlon", evtCd: "TRIATHLON_FULL", recordTimeSec: 12 * H }),
    ];
    expect(findRecordIssues(rows).get("a")?.[0].kind).toBe("duplicate");
  });

  it("한 줄에 여러 이상이 같이 붙는다", () => {
    const issues = findRecordIssues([row({ id: "a", evtCd: "OLYMPIC", recordTimeSec: 60 })]);
    expect(issues.get("a")?.map((i) => i.kind)).toEqual(["sport_mismatch"]);
    const both = findRecordIssues([row({ id: "a", compId: "c1", recordTimeSec: 60 }), row({ id: "b", compId: "c1", recordTimeSec: 60 })]);
    expect(both.get("a")?.map((i) => i.kind)).toEqual(["too_fast", "duplicate"]);
  });
});

describe("sortRecords", () => {
  const rows = [
    row({ id: "a", recordTimeSec: 4 * H, raceDate: "2026-01-01", createdAt: "2026-05-01T00:00:00Z" }),
    row({ id: "b", recordTimeSec: 3 * H, raceDate: "2026-04-01", createdAt: "2026-02-01T00:00:00Z" }),
    row({ id: "c", recordTimeSec: 5 * H, raceDate: "2025-10-01", createdAt: "2026-03-01T00:00:00Z" }),
  ];
  it("등록순·대회일순은 최신부터, 기록순은 빠른 것부터", () => {
    expect(sortRecords(rows, "created").map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(sortRecords(rows, "race_date").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortRecords(rows, "time").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("filterRecords · 선택지", () => {
  const rows = [
    row({ id: "a", raceDate: "2026-10-01" }),
    row({ id: "b", raceDate: "2025-04-01", memNm: "김철수", evtCd: "HALF", eventLabel: "로드 런 · HALF" }),
    row({ id: "c", raceDate: null, raceName: "트레일 대회", eventLabel: "트레일 런 · 50K" }),
  ];
  const base = { search: "", event: ALL, period: ALL, issuesOnly: false };
  const today = "2026-11-16";

  it("종목·기간·검색", () => {
    expect(filterRecords(rows, { ...base, event: "로드 런 · HALF" }, new Map(), today).map((r) => r.id)).toEqual(["b"]);
    expect(filterRecords(rows, { ...base, period: "recent3m" }, new Map(), today).map((r) => r.id)).toEqual(["a"]);
    expect(filterRecords(rows, { ...base, period: "2025" }, new Map(), today).map((r) => r.id)).toEqual(["b"]);
    expect(filterRecords(rows, { ...base, search: "트레일" }, new Map(), today).map((r) => r.id)).toEqual(["c"]);
    expect(filterRecords(rows, { ...base, search: "김철" }, new Map(), today).map((r) => r.id)).toEqual(["b"]);
  });

  it("이상만", () => {
    const issues = new Map([["b", []]]);
    expect(filterRecords(rows, { ...base, issuesOnly: true }, issues, today).map((r) => r.id)).toEqual(["b"]);
  });

  it("기간 선택지는 기록이 있는 연도 최신부터, 종목은 많은 순", () => {
    expect(periodOptions(rows).map((o) => o.value)).toEqual([ALL, "recent3m", "2026", "2025"]);
    const ev = eventOptions([...rows, row({ id: "d", eventLabel: "로드 런 · HALF" })]);
    expect(ev[1]).toEqual({ value: "로드 런 · HALF", label: "로드 런 · HALF (2)" });
  });
});
