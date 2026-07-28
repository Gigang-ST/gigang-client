import { describe, expect, it } from "vitest";

import { formatWeekLabel, getTeamPulse } from "@/lib/team-pulse";

import type { TeamWeek } from "@/lib/queries/team-overview";

/**
 * 활동량 = attd_cnt + rec_cnt. 임계값 경계를 정확히 짚어야 하므로 attd_cnt 하나로만 만든다
 * (gthr_cnt는 판정에 안 들어간다 — 모임 개수는 규모를 안 담아 제외된 값이다).
 */
function week(activity: number, wStart = "2026-07-20"): TeamWeek {
  return { w_start: wStart, gthr_cnt: 99, attd_cnt: activity, rec_cnt: 0 };
}

/** 직전 4주를 같은 값으로 채운 뒤 이번 주를 붙인다 — baseline = past */
function weeksWith(past: number, current: number): TeamWeek[] {
  return [...Array.from({ length: 4 }, () => week(past)), week(current)];
}

describe("getTeamPulse - 기준선이 없는 초기 크루 (절대량 판정)", () => {
  it("주 데이터가 아예 없으면 dormant", () => {
    expect(getTeamPulse([])).toMatchObject({
      level: "dormant",
      label: "완전 휴식",
      message: "아직 심박이 잡히지 않았어요",
    });
  });

  it("활동 10이면 최상 — 경계값", () => {
    expect(getTeamPulse([week(10)]).level).toBe("blazing");
  });

  it("활동 9면 한 단계 아래", () => {
    expect(getTeamPulse([week(9)]).level).toBe("steady");
  });

  it("활동 4면 steady — 경계값", () => {
    expect(getTeamPulse([week(4)]).level).toBe("steady");
  });

  it("활동 3이면 resting", () => {
    expect(getTeamPulse([week(3)]).level).toBe("resting");
  });

  it("활동 1이면 resting — 경계값", () => {
    expect(getTeamPulse([week(1)]).level).toBe("resting");
  });

  it("활동 0이면 실종", () => {
    expect(getTeamPulse([week(0)]).level).toBe("dormant");
  });

  it("직전 4주가 전부 0이어도 baseline 0으로 보고 절대량 판정", () => {
    expect(getTeamPulse(weeksWith(0, 10)).level).toBe("blazing");
  });
});

describe("getTeamPulse - 직전 4주 평균 대비 비율 판정", () => {
  // 경계는 `LEVEL_RATIO_FLOORS`(blazing 1.3 / steady 0.9 / resting 0.6 / dormant 0)를 따른다.
  // 평균만큼 뛴 주(ratio 1.0)는 **steady**다 — "평소대로"를 최상으로 부르면 최상이 기본값이
  // 돼 위쪽이 안 남는다. 최상은 평소를 확실히 넘겼을 때(1.3배)만 준다.
  it("평균과 같으면(ratio 1.0) steady — '평소대로'가 곧 꾸준한 페이스", () => {
    expect(getTeamPulse(weeksWith(10, 10))).toMatchObject({
      level: "steady",
      label: "꾸준한 페이스",
    });
  });

  it("ratio 1.3이면 blazing — 경계값", () => {
    expect(getTeamPulse(weeksWith(10, 13)).level).toBe("blazing");
  });

  it("ratio 1.2면 steady — 1.3 바로 아래", () => {
    expect(getTeamPulse(weeksWith(10, 12)).level).toBe("steady");
  });

  it("평균을 크게 넘으면 최상", () => {
    expect(getTeamPulse(weeksWith(10, 20)).level).toBe("blazing");
  });

  it("ratio 0.9면 steady — 경계값", () => {
    expect(getTeamPulse(weeksWith(10, 9)).level).toBe("steady");
  });

  it("ratio 0.8이면 resting — 0.9 바로 아래", () => {
    expect(getTeamPulse(weeksWith(10, 8)).level).toBe("resting");
  });

  it("ratio 0.6이면 resting — 경계값", () => {
    expect(getTeamPulse(weeksWith(10, 6)).level).toBe("resting");
  });

  it("ratio 0.5면 dormant — 0.6 바로 아래", () => {
    expect(getTeamPulse(weeksWith(10, 5)).level).toBe("dormant");
  });

  it("이번 주 활동 0이면 실종", () => {
    expect(getTeamPulse(weeksWith(10, 0)).level).toBe("dormant");
  });

  it("이번 주는 기준선 계산에서 빠진다 — 직전 4주만 평균낸다", () => {
    // 직전 4주 평균 10, 이번 주 10. 이번 주까지 5주로 평균내면 10이라 결과가 같아지므로
    // 이번 주가 튀는 값일 때로 검증한다: 평균 10인데 이번 주 100 → ratio 10 (blazing).
    // 이번 주가 baseline에 섞이면 100/28 = 3.5로 여전히 blazing이지만,
    // 반대로 이번 주 0일 때 baseline에 섞이면 0/8 = 0으로 판정이 흐려진다.
    expect(getTeamPulse(weeksWith(10, 0)).level).toBe("dormant");
    expect(getTeamPulse(weeksWith(10, 100)).level).toBe("blazing");
  });

  it("5주보다 긴 배열이어도 직전 4주만 본다", () => {
    // 앞쪽 3주는 활동 0이지만 baseline에 들어가면 안 된다(직전 4주 = 전부 10).
    // 섞였다면 baseline이 10에서 4.3으로 떨어져 ratio 2.3(blazing)이 됐을 것 —
    // steady로 나오는 것 자체가 앞쪽 3주가 빠졌다는 증거다.
    const weeks = [week(0), week(0), week(0), ...weeksWith(10, 10)];
    expect(getTeamPulse(weeks).level).toBe("steady");
  });

  it("attd_cnt와 rec_cnt를 합산해 활동량을 낸다", () => {
    const weeks: TeamWeek[] = [
      ...Array.from({ length: 4 }, () => week(10)),
      { w_start: "2026-07-20", gthr_cnt: 0, attd_cnt: 5, rec_cnt: 5 },
    ];
    // 5+5=10 → ratio 1.0. 하나만 셌다면 ratio 0.5로 dormant가 됐을 것.
    expect(getTeamPulse(weeks).level).toBe("steady");
  });
});

describe("formatWeekLabel", () => {
  it("1일 시작 주는 첫째주", () => {
    expect(formatWeekLabel("2026-06-01")).toBe("6월 첫째주");
  });

  it("7일 시작 주는 첫째주 — 경계값", () => {
    expect(formatWeekLabel("2026-06-07")).toBe("6월 첫째주");
  });

  it("8일 시작 주는 둘째주 — 경계값", () => {
    expect(formatWeekLabel("2026-06-08")).toBe("6월 둘째주");
  });

  it("29일 시작 주는 다섯째주", () => {
    expect(formatWeekLabel("2026-06-29")).toBe("6월 다섯째주");
  });

  it("31일 시작 주도 다섯째주로 묶는다 — 여섯째주는 만들지 않는다", () => {
    expect(formatWeekLabel("2026-03-31")).toBe("3월 다섯째주");
  });
});
