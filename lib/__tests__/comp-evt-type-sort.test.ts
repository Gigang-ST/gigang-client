import { describe, expect, it } from "vitest";

import {
  buildSortedEventTypeOptions,
  compEvtTypeKm,
  sortCompEvtTypes,
  toCompEvtTypes,
} from "@/lib/comp-evt-type";

/**
 * 대회 종목 표시 순서(#575) — 긴(어려운) 종목부터.
 * DB 입력 순서나 문자열 순서에 맡기면 같은 대회가 화면마다 다른 순서로 나온다.
 */
describe("sortCompEvtTypes", () => {
  it("문자열 순서가 아니라 거리로 정렬한다", () => {
    // 문자열 정렬이면 100K < 160K < 20K < 60K
    expect(sortCompEvtTypes(["100K", "160K", "20K", "60K"])).toEqual(["160K", "100K", "60K", "20K"]);
  });

  it("입력 순서와 무관하게 같은 결과를 낸다", () => {
    expect(sortCompEvtTypes(["20K", "160K", "60K", "100K"])).toEqual(["160K", "100K", "60K", "20K"]);
  });

  it("FULL·HALF와 숫자 종목을 섞어도 거리로 선다", () => {
    expect(sortCompEvtTypes(["10K", "FULL", "5K", "HALF"])).toEqual(["FULL", "HALF", "10K", "5K"]);
  });

  it("100M(마일)은 거리 종목으로 읽혀 160K보다도 앞선다", () => {
    // 100마일 = 160.934km > 160K. 거리 없는 종목으로 떨어지면 맨 뒤로 간다
    expect(sortCompEvtTypes(["100K", "160K", "100M", "50K"], "trail_run")).toEqual([
      "100M",
      "160K",
      "100K",
      "50K",
    ]);
  });

  it("철인3종은 킹 → 하프 → 올림픽 → 스프린트", () => {
    expect(sortCompEvtTypes(["SPRINT", "OLYMPIC", "HALF", "FULL"], "triathlon")).toEqual([
      "FULL",
      "HALF",
      "OLYMPIC",
      "SPRINT",
    ]);
  });

  it("철인3종 TRIATHLON_* 코드와 접두어 없는 코드가 섞여도 같은 기준이다", () => {
    expect(sortCompEvtTypes(["TRIATHLON_OLYMPIC", "FULL", "TRIATHLON_HALF"], "triathlon")).toEqual([
      "FULL",
      "TRIATHLON_HALF",
      "TRIATHLON_OLYMPIC",
    ]);
  });

  it("사이클은 그란폰도가 메디오폰도보다 앞이다", () => {
    expect(sortCompEvtTypes(["MEDIOFONDO", "GRANFONDO"], "cycling")).toEqual(["GRANFONDO", "MEDIOFONDO"]);
  });

  it("거리를 모르는 종목은 뒤로, 그 안에서는 들어온 순서를 지킨다", () => {
    expect(sortCompEvtTypes(["PRO SINGLE", "10K", "OPEN DOUBLE", "HALF"])).toEqual([
      "HALF",
      "10K",
      "PRO SINGLE",
      "OPEN DOUBLE",
    ]);
  });

  it("뒤에 말이 붙은 종목은 앞의 거리로 읽는다", () => {
    expect(sortCompEvtTypes(["20K", "35K DUO", "50K"])).toEqual(["50K", "35K DUO", "20K"]);
  });

  it("원소를 정규화하지 않고 순서만 바꾸며, 원본 배열을 건드리지 않는다", () => {
    const input = ["10k", "full"];
    expect(sortCompEvtTypes(input)).toEqual(["full", "10k"]);
    expect(input).toEqual(["10k", "full"]);
  });
});

describe("toCompEvtTypes", () => {
  it("직접 조회 임베드(객체 배열)를 받는다", () => {
    expect(
      toCompEvtTypes([{ comp_evt_type: "20k" }, { comp_evt_type: null }, { comp_evt_type: " 160K " }], "trail_run"),
    ).toEqual(["160K", "20K"]);
  });

  it("RPC 문자열 배열을 받는다", () => {
    expect(toCompEvtTypes(["100K", "160K", "20K", "60K", null])).toEqual(["160K", "100K", "60K", "20K"]);
  });

  it("값이 없으면 빈 배열", () => {
    expect(toCompEvtTypes(null)).toEqual([]);
    expect(toCompEvtTypes(undefined)).toEqual([]);
    expect(toCompEvtTypes([{ comp_evt_type: "" }])).toEqual([]);
  });

  it("철인 대회는 종목(sport)을 넘겨야 킹이 올림픽보다 앞선다", () => {
    expect(toCompEvtTypes(["OLYMPIC", "FULL", "SPRINT"], "triathlon")).toEqual(["FULL", "OLYMPIC", "SPRINT"]);
  });
});

describe("buildSortedEventTypeOptions", () => {
  it("대회 종목이 먼저 서고, 대회에 없는 기본 종목은 그 뒤에 붙는다", () => {
    // 첫 선택지가 참가 신청 기본값이다 — 10K 대회에서 FULL이 맨 앞에 오면 없는 코스로 신청된다
    expect(buildSortedEventTypeOptions(["10K"], ["5K", "10K", "HALF", "FULL"], "road_run")).toEqual([
      "10K",
      "FULL",
      "HALF",
      "5K",
    ]);
  });

  it("대회 종목끼리, 기본 종목끼리 각각 긴 것부터", () => {
    expect(
      buildSortedEventTypeOptions(["20K", "160K", "60K", "100K"], ["20K", "50K", "100K", "100M"], "trail_run"),
    ).toEqual(["160K", "100K", "60K", "20K", "100M", "50K"]);
  });
});

describe("compEvtTypeKm", () => {
  it("100M은 100마일 거리다", () => {
    expect(compEvtTypeKm("100M")).toBe(160.934);
  });
});
