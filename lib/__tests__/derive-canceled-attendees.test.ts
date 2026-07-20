import { describe, expect, it } from "vitest";

import {
  deriveCanceledAttendees,
  type GatheringAttdHistEvent,
} from "@/lib/gathering/derive-canceled-attendees";

type Evt = GatheringAttdHistEvent & { reason_txt: string | null };

function evt(overrides: Partial<Evt> & { mem_id: string; evt_at: string }): Evt {
  return {
    evt_cd: "cancel",
    reason_txt: null,
    ...overrides,
  };
}

describe("deriveCanceledAttendees", () => {
  it("빈 이력은 빈 배열을 반환한다", () => {
    expect(deriveCanceledAttendees([], [])).toEqual([]);
  });

  it("취소 후 현재 미참석인 멤버를 반환한다", () => {
    const hist = [evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z", reason_txt: "부상" })];
    const result = deriveCanceledAttendees(hist, []);
    expect(result).toHaveLength(1);
    expect(result[0].mem_id).toBe("m1");
    expect(result[0].reason_txt).toBe("부상");
  });

  it("재참석 케이스: rel(attendingMemIds)에 있으면 hist상 마지막이 cancel이어도 제외한다", () => {
    const hist = [evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z" })];
    const result = deriveCanceledAttendees(hist, ["m1"]);
    expect(result).toEqual([]);
  });

  it("재참석 케이스: Set으로 넘긴 attendingMemIds도 동일하게 동작한다", () => {
    const hist = [evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z" })];
    const result = deriveCanceledAttendees(hist, new Set(["m1"]));
    expect(result).toEqual([]);
  });

  it("다중 취소 케이스: 같은 멤버가 여러 번 취소했으면 최신 1건만 채택한다", () => {
    const hist = [
      evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z", reason_txt: "1차 취소(오래됨)" }),
      evt({ mem_id: "m1", evt_at: "2026-07-10T00:00:00Z", reason_txt: "2차 취소(최신)" }),
    ];
    const result = deriveCanceledAttendees(hist, []);
    expect(result).toHaveLength(1);
    expect(result[0].reason_txt).toBe("2차 취소(최신)");
  });

  it("register 이벤트 무시 케이스: 마지막 이벤트가 register면 취소자에서 제외한다", () => {
    const hist = [
      evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z", evt_cd: "cancel" }),
      evt({ mem_id: "m1", evt_at: "2026-07-10T00:00:00Z", evt_cd: "register" }),
    ];
    const result = deriveCanceledAttendees(hist, []);
    expect(result).toEqual([]);
  });

  it("register 이벤트만 있는 멤버는 애초에 취소자가 아니다", () => {
    const hist = [evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z", evt_cd: "register" })];
    const result = deriveCanceledAttendees(hist, []);
    expect(result).toEqual([]);
  });

  it("여러 멤버의 취소자를 최신 취소순(evt_at desc)으로 정렬해 반환한다", () => {
    const hist = [
      evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z" }),
      evt({ mem_id: "m2", evt_at: "2026-07-15T00:00:00Z" }),
      evt({ mem_id: "m3", evt_at: "2026-07-10T00:00:00Z" }),
    ];
    const result = deriveCanceledAttendees(hist, []);
    expect(result.map((e) => e.mem_id)).toEqual(["m2", "m3", "m1"]);
  });

  it("일부는 재참석·일부는 취소 상태가 섞인 혼합 케이스", () => {
    const hist = [
      evt({ mem_id: "m1", evt_at: "2026-07-01T00:00:00Z" }), // 취소 유지
      evt({ mem_id: "m2", evt_at: "2026-07-02T00:00:00Z" }), // rel에 있어 제외
      evt({ mem_id: "m3", evt_at: "2026-07-03T00:00:00Z", evt_cd: "register" }), // register라 제외
    ];
    const result = deriveCanceledAttendees(hist, ["m2"]);
    expect(result.map((e) => e.mem_id)).toEqual(["m1"]);
  });
});
