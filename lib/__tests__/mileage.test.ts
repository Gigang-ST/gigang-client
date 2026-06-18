import { describe, expect, it } from "vitest";

import {
  calcBaseMileage,
  calcDailyNeeded,
  calcFinalMileage,
  calcMonthRefundRate,
  calcNextMonthGoal,
  calcPaceRatio,
  countMonths,
  roundMileage,
} from "@/lib/mileage";

describe("calcBaseMileage", () => {
  it("러닝: km + 고도/100", () => {
    expect(calcBaseMileage("RUNNING", 10, 200)).toBe(12);
  });

  it("트레일: km + 고도/100", () => {
    expect(calcBaseMileage("TRAIL", 10, 500)).toBe(15);
  });

  it("자전거: km/4 + 고도/100", () => {
    expect(calcBaseMileage("CYCLING", 40, 200)).toBe(12);
  });

  it("수영: km × 3 (고도 무시)", () => {
    expect(calcBaseMileage("SWIMMING", 2, 0)).toBe(6);
  });

  it("고도 0인 러닝은 km 그대로", () => {
    expect(calcBaseMileage("RUNNING", 5, 0)).toBe(5);
  });
});

describe("calcFinalMileage", () => {
  it("배율 없으면 baseMileage 그대로", () => {
    expect(calcFinalMileage(10, [])).toBe(10);
  });

  it("배율 하나 적용", () => {
    expect(calcFinalMileage(10, [1.5])).toBe(15);
  });

  it("배율 여러 개 중첩 곱셈", () => {
    expect(calcFinalMileage(10, [2, 1.5])).toBe(30);
  });
});

describe("calcNextMonthGoal", () => {
  it("미달성이면 목표 유지", () => {
    expect(calcNextMonthGoal(50, false)).toBe(50);
  });

  it("50km 이하 달성 → +10", () => {
    expect(calcNextMonthGoal(50, true)).toBe(60);
    expect(calcNextMonthGoal(30, true)).toBe(40);
  });

  it("50 초과 100 미만 달성 → +15", () => {
    expect(calcNextMonthGoal(60, true)).toBe(75);
    expect(calcNextMonthGoal(80, true)).toBe(95);
  });

  it("100 이상 달성 → +20", () => {
    expect(calcNextMonthGoal(100, true)).toBe(120);
    expect(calcNextMonthGoal(150, true)).toBe(170);
  });
});

describe("calcMonthRefundRate", () => {
  it("목표 0이면 0 반환", () => {
    expect(calcMonthRefundRate(50, 0)).toBe(0);
  });

  it("목표 달성률 계산", () => {
    expect(calcMonthRefundRate(50, 100)).toBe(0.5);
  });

  it("초과 달성해도 최대 1.0", () => {
    expect(calcMonthRefundRate(120, 100)).toBe(1.0);
  });

  it("정확히 100% 달성", () => {
    expect(calcMonthRefundRate(100, 100)).toBe(1.0);
  });
});

describe("calcPaceRatio", () => {
  it("목표 0이면 0 반환", () => {
    expect(calcPaceRatio(50, 0, 15, 30)).toBe(0);
  });

  it("시간 진행률 0이면 0 반환", () => {
    expect(calcPaceRatio(10, 100, 0, 30)).toBe(0);
  });

  it("진행률과 시간률이 같으면 1.0", () => {
    // 50km / 100km = 0.5, 15일 / 30일 = 0.5 → 비율 1.0
    expect(calcPaceRatio(50, 100, 15, 30)).toBe(1.0);
  });

  it("앞서가면 1 초과", () => {
    // 60km / 100km = 0.6, 15일 / 30일 = 0.5 → 1.2
    expect(calcPaceRatio(60, 100, 15, 30)).toBeCloseTo(1.2);
  });
});

describe("calcDailyNeeded", () => {
  it("이미 목표 달성이면 'done'", () => {
    expect(calcDailyNeeded(100, 100, 15, 30)).toBe("done");
    expect(calcDailyNeeded(110, 100, 15, 30)).toBe("done");
  });

  it("남은 일수 없으면 0", () => {
    expect(calcDailyNeeded(80, 100, 31, 30)).toBe(0);
  });

  it("남은 거리 / 남은 일수 계산", () => {
    // 남은 거리: 100 - 50 = 50, 남은 일수: 30 - 20 + 1 = 11
    expect(calcDailyNeeded(50, 100, 20, 30)).toBeCloseTo(50 / 11);
  });
});

describe("countMonths", () => {
  it("같은 달이면 1", () => {
    expect(countMonths("2024-01", "2024-01")).toBe(1);
  });

  it("연속 두 달", () => {
    expect(countMonths("2024-01", "2024-02")).toBe(2);
  });

  it("연 넘기는 구간", () => {
    expect(countMonths("2023-11", "2024-02")).toBe(4);
  });

  it("from > to이면 0", () => {
    expect(countMonths("2024-06", "2024-01")).toBe(0);
  });
});

describe("roundMileage", () => {
  it("소수점 둘째자리 반올림", () => {
    expect(roundMileage(10.555)).toBe(10.56);
    expect(roundMileage(10.554)).toBe(10.55);
  });

  it("정수는 그대로", () => {
    expect(roundMileage(10)).toBe(10);
  });
});
