import { describe, expect, it } from "vitest";

import {
  HYROX_DIVISION_MESSAGE,
  HYROX_SPORT_MISMATCH_MESSAGE,
  hyroxCompetitionIssue,
  isHyroxRecordDivision,
} from "@/lib/hyrox";
import { competitionEditSchema, competitionRegisterSchemaAllowPast } from "@/lib/validations/competition";

/**
 * #671 — 운영의 「서울 하이록스」가 종목 road_run + 코스 `OPEN SINGLE`·`OPEN DOUBLE` 로 등록돼
 * 전당 하이록스 판·MCP 에 기록이 하나도 안 잡혔다. 같은 모양이 다시 등록되지 않게 막는다.
 */
describe("hyroxCompetitionIssue", () => {
  it("운영에서 실제로 들어간 모양(road_run + OPEN SINGLE)은 종목에서 막는다", () => {
    expect(
      hyroxCompetitionIssue({ title: "서울 하이록스", sport: "road_run", eventTypes: ["OPEN SINGLE", "OPEN DOUBLE"] }),
    ).toEqual({ field: "sport", message: HYROX_SPORT_MISMATCH_MESSAGE });
  });

  it("영문 HYROX 이름도 대소문자 없이 알아본다", () => {
    expect(hyroxCompetitionIssue({ title: "Hyrox Incheon", sport: "road_run", eventTypes: ["10K"] })?.field).toBe(
      "sport",
    );
  });

  it("종목이 하이록스면 코스가 부문 코드여야 한다", () => {
    expect(hyroxCompetitionIssue({ title: "서울 하이록스", sport: "hyrox", eventTypes: ["OPEN", "OPEN SINGLE"] })).toEqual(
      { field: "eventTypes", message: HYROX_DIVISION_MESSAGE },
    );
  });

  it("하이록스 종목 + 부문 코드는 통과(소문자·공백 무시)", () => {
    expect(
      hyroxCompetitionIssue({ title: "서울 하이록스", sport: "hyrox", eventTypes: [" open", "PRO", "DOUBLES", "RELAY"] }),
    ).toBeNull();
  });

  it("이름에 하이록스가 없는 다른 종목 대회는 건드리지 않는다", () => {
    expect(hyroxCompetitionIssue({ title: "서울 마라톤", sport: "road_run", eventTypes: ["FULL", "OPEN SINGLE"] })).toBeNull();
  });
});

describe("isHyroxRecordDivision", () => {
  it("부문 코드만 참", () => {
    expect(isHyroxRecordDivision("OPEN")).toBe(true);
    expect(isHyroxRecordDivision(" doubles ")).toBe(true);
    expect(isHyroxRecordDivision("OPEN SINGLE")).toBe(false);
    expect(isHyroxRecordDivision(null)).toBe(false);
  });
});

describe("대회 폼 스키마 — 하이록스 검사", () => {
  const base = {
    title: "서울 하이록스",
    startDate: "2026-11-13",
    endDate: "",
    location: "서울",
    sourceUrl: "https://hyrox.com",
    customEventType: "",
  };

  it("등록 폼: road_run 이면 종목 칸에 오류", () => {
    const r = competitionRegisterSchemaAllowPast.safeParse({ ...base, sport: "road_run", selectedEventTypes: ["10K"] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("sport");
  });

  it("등록 폼: 하이록스 + 기타 직접 입력 코스는 코스 칸에 오류, 「기타」 표식은 세지 않는다", () => {
    const bad = competitionRegisterSchemaAllowPast.safeParse({
      ...base,
      sport: "hyrox",
      selectedEventTypes: ["OPEN", "__OTHER__", "OPEN SINGLE"],
    });
    expect(bad.error?.issues.map((i) => i.path.join("."))).toContain("selectedEventTypes");

    const ok = competitionRegisterSchemaAllowPast.safeParse({
      ...base,
      sport: "hyrox",
      selectedEventTypes: ["OPEN", "DOUBLES", "__OTHER__"],
    });
    expect(ok.success).toBe(true);
  });

  it("수정 폼: 같은 검사", () => {
    const r = competitionEditSchema.safeParse({ ...base, sport: "hyrox", eventTypes: ["PRO DOUBLE"] });
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("eventTypes");
  });
});
