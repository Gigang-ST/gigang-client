import { describe, expect, it } from "vitest";

import { calcExemption } from "@/lib/dues/calc-exemption";

const FEE = 2000; // 기본 월 회비

describe("calcExemption — 게이트", () => {
  it("게이트 미충족(정모0·개설0)이면 참석 많아도 0원", () => {
    // 설계 §2.3: 일반 벙 5회 참석, 정모X, 개설X → 0원
    const r = calcExemption({ attendCnt: 5, regularAttendCnt: 0, hostedCnt: 0 }, FEE);
    expect(r.gatePassed).toBe(false);
    expect(r.exmAmt).toBe(0);
  });

  it("정모 1회 참석으로 게이트 통과", () => {
    const r = calcExemption({ attendCnt: 4, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.gatePassed).toBe(true);
  });

  it("벙 1회 개설로 게이트 통과(정모 없어도)", () => {
    const r = calcExemption({ attendCnt: 4, regularAttendCnt: 0, hostedCnt: 1 }, FEE);
    expect(r.gatePassed).toBe(true);
  });
});

describe("calcExemption — 티어(설계 §2.3 예시)", () => {
  it("정모 참석 + 일반 벙 3회 = 4회 → 1,000원", () => {
    const r = calcExemption({ attendCnt: 4, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.exmAmt).toBe(1000);
  });

  it("벙 개설(=참석1) + 추가 참석 7회 = 8회 → 전액 2,000원", () => {
    const r = calcExemption({ attendCnt: 8, regularAttendCnt: 0, hostedCnt: 1 }, FEE);
    expect(r.exmAmt).toBe(2000);
  });

  it("정모 참석 + 추가 참석 9회 = 10회 → 전액(8회 이상이면 전액)", () => {
    const r = calcExemption({ attendCnt: 10, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.exmAmt).toBe(2000);
  });

  it("게이트 통과 + 참석 3회(티어 미달) → 0원", () => {
    const r = calcExemption({ attendCnt: 3, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.exmAmt).toBe(0);
  });

  it("단계형: 8회는 2,000원이지 1,000+2,000=3,000이 아님", () => {
    const r = calcExemption({ attendCnt: 8, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.exmAmt).toBe(2000);
  });
});

describe("calcExemption — 회비 단가 변동", () => {
  it("회비 홀수(1,500원) 50% = 750원(반올림)", () => {
    const r = calcExemption({ attendCnt: 4, regularAttendCnt: 1, hostedCnt: 0 }, 1500);
    expect(r.exmAmt).toBe(750);
  });

  it("전액 면제는 회비를 초과하지 않음(클램프)", () => {
    const r = calcExemption({ attendCnt: 8, regularAttendCnt: 1, hostedCnt: 0 }, 1500);
    expect(r.exmAmt).toBe(1500);
  });

  it("회비가 바뀌면 감면액도 비례(단가 × 비율)", () => {
    const r = calcExemption({ attendCnt: 4, regularAttendCnt: 1, hostedCnt: 0 }, 3000);
    expect(r.exmAmt).toBe(1500);
  });
});

describe("calcExemption — nextTier 진행도", () => {
  it("4회는 다음 티어가 8회, 4번 남음", () => {
    const r = calcExemption({ attendCnt: 4, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.nextTier).toEqual({ attendCnt: 8, remaining: 4, exmAmt: 2000 });
  });

  it("0회는 다음 티어가 4회, 4번 남음(게이트 무관하게 안내)", () => {
    const r = calcExemption({ attendCnt: 0, regularAttendCnt: 0, hostedCnt: 0 }, FEE);
    expect(r.nextTier).toEqual({ attendCnt: 4, remaining: 4, exmAmt: 1000 });
  });

  it("8회 이상은 다음 티어 없음", () => {
    const r = calcExemption({ attendCnt: 9, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.nextTier).toBeUndefined();
  });

  it("gateDetail은 입력 집계를 그대로 반영", () => {
    const r = calcExemption({ attendCnt: 6, regularAttendCnt: 2, hostedCnt: 1 }, FEE);
    expect(r.gateDetail).toEqual({ regularAttend: 2, hosted: 1 });
  });
});

describe("calcExemption — tiers (카드 마커용)", () => {
  it("티어 목록은 횟수·금액·달성여부를 오름차순으로 반환", () => {
    const r = calcExemption({ attendCnt: 5, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.tiers).toEqual([
      { attendCnt: 4, exmAmt: 1000, reached: true },
      { attendCnt: 8, exmAmt: 2000, reached: false },
    ]);
  });

  it("8회 달성 시 두 티어 모두 reached", () => {
    const r = calcExemption({ attendCnt: 8, regularAttendCnt: 1, hostedCnt: 0 }, FEE);
    expect(r.tiers.every((t) => t.reached)).toBe(true);
  });

  it("게이트 미충족이어도 tiers는 횟수 기준 reached를 반환(카드 표시용)", () => {
    const r = calcExemption({ attendCnt: 4, regularAttendCnt: 0, hostedCnt: 0 }, FEE);
    expect(r.gatePassed).toBe(false);
    expect(r.tiers[0].reached).toBe(true); // 4회 도달은 사실. 게이트는 카드가 별도 처리
  });

  it("회비 단가에 따라 티어 금액도 비례", () => {
    const r = calcExemption({ attendCnt: 0, regularAttendCnt: 0, hostedCnt: 0 }, 1500);
    expect(r.tiers).toEqual([
      { attendCnt: 4, exmAmt: 750, reached: false },
      { attendCnt: 8, exmAmt: 1500, reached: false },
    ]);
  });
});
