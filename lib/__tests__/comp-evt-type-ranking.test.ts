import { describe, expect, it } from "vitest";

import { toRankingEvtCd } from "@/lib/comp-evt-type";
import { MARATHON_EVENTS, TRIATHLON_EVENTS } from "@/lib/records-board";

/**
 * 랭킹 종목 코드(#581) — RPC `get_public_team_race_rankings`의 `evt_cd` CASE와 같은 규칙이어야 한다.
 * 철인 대회의 접두어 없는 코드가 마라톤 칸으로 새면 13시간대 아이언맨 기록이 풀마 랭킹에 선다.
 */
describe("toRankingEvtCd", () => {
  it("철인 대회의 FULL·HALF·OLYMPIC·SPRINT는 TRIATHLON_*으로 읽는다", () => {
    expect(toRankingEvtCd("triathlon", "FULL")).toBe("TRIATHLON_FULL");
    expect(toRankingEvtCd("triathlon", "HALF")).toBe("TRIATHLON_HALF");
    expect(toRankingEvtCd("triathlon", "OLYMPIC")).toBe("TRIATHLON_OLYMPIC");
    expect(toRankingEvtCd("triathlon", "SPRINT")).toBe("TRIATHLON_SPRINT");
  });

  it("대소문자·공백이 섞여 들어와도 같은 코드가 된다", () => {
    expect(toRankingEvtCd("triathlon", " full ")).toBe("TRIATHLON_FULL");
  });

  it("이미 TRIATHLON_*인 옛 데이터는 그대로 통과한다(접두어를 두 번 붙이지 않는다)", () => {
    expect(toRankingEvtCd("triathlon", "TRIATHLON_HALF")).toBe("TRIATHLON_HALF");
  });

  it("로드 대회의 FULL·HALF는 마라톤 코드 그대로다", () => {
    expect(toRankingEvtCd("road_run", "FULL")).toBe("FULL");
    expect(toRankingEvtCd("road_run", "half")).toBe("HALF");
  });

  it("스포츠를 모르면 바꾸지 않는다 — 대회 행을 못 읽어도 지금 동작에서 더 나빠지지 않게", () => {
    expect(toRankingEvtCd(null, "FULL")).toBe("FULL");
    expect(toRankingEvtCd(undefined, "OLYMPIC")).toBe("OLYMPIC");
  });

  it("철인의 접두어 없는 코드가 아닌 값(거리 코드 등)은 손대지 않는다", () => {
    expect(toRankingEvtCd("triathlon", "10K")).toBe("10K");
    expect(toRankingEvtCd("cycling", "GRANFONDO")).toBe("GRANFONDO");
  });

  it("철인 풀·하프는 전당 철인 칸에 서고 마라톤 칸에는 서지 않는다", () => {
    const marathon = new Set<string>(MARATHON_EVENTS.map((e) => e.eventType));
    const triathlon = new Set<string>(TRIATHLON_EVENTS.map((e) => e.eventType));
    for (const evt of ["FULL", "HALF"]) {
      const cd = toRankingEvtCd("triathlon", evt);
      expect(marathon.has(cd)).toBe(false);
      expect(triathlon.has(cd)).toBe(true);
    }
  });
});
