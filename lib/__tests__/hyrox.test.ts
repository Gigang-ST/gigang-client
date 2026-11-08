import { describe, expect, it } from "vitest";

import { toRankingEvtCd } from "@/lib/comp-evt-type";
import {
  HYROX_DIVISIONS,
  buildHyroxBoards,
  isHyroxSport,
  parseHyroxSplits,
  serializeHyroxSplits,
  sumHyroxSplits,
  type HyroxRankingRow,
} from "@/lib/hyrox";

/**
 * 하이록스 판(#349) — 전당 화면과 MCP `list_hyrox_rankings` 가 같은 계산을 쓴다.
 * 틀려도 크래시가 없는 규칙(사람당 한 줄·남녀 분리·릴레이 제외·동률 순서)을 못박는다.
 */

function row(over: Partial<HyroxRankingRow>): HyroxRankingRow {
  return {
    race_result_id: crypto.randomUUID(),
    mem_id: "m1",
    mem_nm: "가",
    gdr_enm: "male",
    evt_cd: "HYROX_OPEN",
    rec_time_sec: 4000,
    race_nm: "HYROX Seoul",
    race_dt: "2026-05-10",
    splits_json: null,
    ...over,
  };
}

describe("스플릿 파싱·직렬화", () => {
  it("알려진 스테이션 + 양수만 남긴다", () => {
    expect(parseHyroxSplits({ SKIERG: 250.4, ROW: -1, FOO: 10, WALL_BALL: "300" })).toEqual({ SKIERG: 250 });
    expect(parseHyroxSplits(null)).toEqual({});
    expect(parseHyroxSplits([1, 2])).toEqual({});
  });

  it("값이 하나도 없으면 null 로 저장한다(빈 객체와 갈리지 않게)", () => {
    expect(serializeHyroxSplits({ SKIERG: null, ROW: 0 })).toBeNull();
    expect(serializeHyroxSplits(null)).toBeNull();
    expect(serializeHyroxSplits({ SKIERG: 250, NOPE: 1 })).toEqual({ SKIERG: 250 });
  });

  it("합계는 입력된 칸만 더한다", () => {
    expect(sumHyroxSplits({ SKIERG: 250, ROW: 260 })).toBe(510);
    expect(sumHyroxSplits({})).toBeNull();
  });

  it("스포츠 코드 판정", () => {
    expect(isHyroxSport("hyrox")).toBe(true);
    expect(isHyroxSport(" HYROX ")).toBe(true);
    expect(isHyroxSport("road_run")).toBe(false);
    expect(isHyroxSport(null)).toBe(false);
  });
});

describe("toRankingEvtCd — 하이록스", () => {
  it("하이록스 대회의 부문은 HYROX_* 로 읽는다(RPC CASE 의 거울)", () => {
    expect(toRankingEvtCd("hyrox", "open")).toBe("HYROX_OPEN");
    expect(toRankingEvtCd("hyrox", "DOUBLES")).toBe("HYROX_DOUBLES");
    expect(toRankingEvtCd("hyrox", "RELAY")).toBe("HYROX_RELAY");
  });

  it("다른 스포츠의 OPEN 은 건드리지 않는다", () => {
    expect(toRankingEvtCd("road_run", "OPEN")).toBe("OPEN");
  });

  it("판 정의의 eventType 은 전부 HYROX_ 접두어다", () => {
    for (const d of HYROX_DIVISIONS) expect(d.eventType).toBe(toRankingEvtCd("hyrox", d.code));
  });
});

describe("buildHyroxBoards", () => {
  it("사람당 가장 빠른 기록 하나만 세운다", () => {
    const [open] = buildHyroxBoards([
      row({ mem_id: "m1", rec_time_sec: 4200 }),
      row({ mem_id: "m1", rec_time_sec: 3900, race_nm: "HYROX Incheon" }),
      row({ mem_id: "m2", mem_nm: "나", rec_time_sec: 4000 }),
    ]);
    expect(open.male.map((e) => [e.memId, e.recordSec, e.rank])).toEqual([
      ["m1", 3900, 1],
      ["m2", 4000, 2],
    ]);
    expect(open.male[0].raceName).toBe("HYROX Incheon");
    expect(open.male[0].record).toBe("1:05:00");
  });

  it("오픈·프로는 남녀가 갈리고 더블스는 한 줄이다", () => {
    const boards = buildHyroxBoards([
      row({ mem_id: "m1" }),
      row({ mem_id: "f1", gdr_enm: "female" }),
      row({ mem_id: "m1", evt_cd: "HYROX_DOUBLES", rec_time_sec: 3600 }),
      row({ mem_id: "f1", gdr_enm: "female", evt_cd: "HYROX_DOUBLES", rec_time_sec: 3500 }),
    ]);
    const open = boards.find((b) => b.eventType === "HYROX_OPEN")!;
    const doubles = boards.find((b) => b.eventType === "HYROX_DOUBLES")!;
    expect(open.male.map((e) => e.memId)).toEqual(["m1"]);
    expect(open.female.map((e) => e.memId)).toEqual(["f1"]);
    expect(open.all).toEqual([]);
    expect(doubles.all.map((e) => e.memId)).toEqual(["f1", "m1"]);
    expect(doubles.male).toEqual([]);
  });

  it("릴레이는 판이 없고, 기록이 없는 부문도 빈 판으로 남는다", () => {
    const boards = buildHyroxBoards([row({ evt_cd: "HYROX_RELAY" })]);
    expect(boards.map((b) => b.eventType)).toEqual(["HYROX_OPEN", "HYROX_PRO", "HYROX_DOUBLES"]);
    expect(boards.every((b) => b.male.length + b.female.length + b.all.length === 0)).toBe(true);
  });

  it("동률이면 먼저 뛴 기록이 앞선다", () => {
    const [open] = buildHyroxBoards([
      row({ mem_id: "late", mem_nm: "가", race_dt: "2026-06-01" }),
      row({ mem_id: "early", mem_nm: "하", race_dt: "2026-05-01" }),
    ]);
    expect(open.male.map((e) => e.memId)).toEqual(["early", "late"]);
  });

  it("스플릿을 실어 나른다(깨진 칸은 버린다)", () => {
    const [open] = buildHyroxBoards([row({ splits_json: { SKIERG: 255, ROW: "x" } })]);
    expect(open.male[0].splits).toEqual({ SKIERG: 255 });
  });
});
