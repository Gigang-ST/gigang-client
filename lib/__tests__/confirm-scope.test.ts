import { describe, expect, it } from "vitest";

import { canReclassify, isDecisionRow, isReclassified } from "@/lib/dues/confirm-scope";

describe("isReclassified", () => {
  it("자동·제외 행에 분류 override 가 있으면 재분류로 본다", () => {
    expect(isReclassified("autoDone", true)).toBe(true);
    expect(isReclassified("excluded", true)).toBe(true);
  });

  it("override 가 없으면 재분류 아님", () => {
    expect(isReclassified("autoDone", false)).toBe(false);
    expect(isReclassified("excluded", false)).toBe(false);
  });

  it("확인필요 행은 원래 편집 대상이라 재분류로 세지 않는다", () => {
    expect(isReclassified("needsReview", true)).toBe(false);
    expect(isReclassified("needsReview", false)).toBe(false);
  });
});

describe("isDecisionRow", () => {
  it("확인필요는 override 유무와 무관하게 항상 결정 경로", () => {
    expect(isDecisionRow("needsReview", false)).toBe(true);
    expect(isDecisionRow("needsReview", true)).toBe(true);
  });

  it("재분류된 자동·제외 행은 결정 경로에 편입", () => {
    expect(isDecisionRow("autoDone", true)).toBe(true);
    expect(isDecisionRow("excluded", true)).toBe(true);
  });

  it("건드리지 않은 자동·제외 행은 저장값 경로(결정 경로 아님)", () => {
    expect(isDecisionRow("autoDone", false)).toBe(false);
    expect(isDecisionRow("excluded", false)).toBe(false);
  });
});

describe("canReclassify", () => {
  it("입금만 재분류 허용, 출금은 막는다", () => {
    expect(canReclassify("deposit")).toBe(true);
    expect(canReclassify("withdrawal")).toBe(false);
  });
});
