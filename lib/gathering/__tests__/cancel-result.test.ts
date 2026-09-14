import { describe, expect, it } from "vitest";

import { parseCancelResult } from "@/lib/gathering/cancel-result";

describe("parseCancelResult", () => {
  it("새 RPC 응답을 그대로 읽는다", () => {
    expect(parseCancelResult({ promoted: ["m1", "m2"], notify_open_seat: false })).toEqual({
      promoted: ["m1", "m2"],
      notifyOpenSeat: false,
    });
  });

  it("빈 자리 알림 플래그는 정확히 true 일 때만 켠다", () => {
    expect(parseCancelResult({ promoted: [], notify_open_seat: true }).notifyOpenSeat).toBe(true);
    expect(parseCancelResult({ promoted: [], notify_open_seat: "true" }).notifyOpenSeat).toBe(false);
    expect(parseCancelResult({ promoted: [] }).notifyOpenSeat).toBe(false);
  });

  it("옛 RPC(uuid[]) 응답이면 승급자는 살리고 빈 자리 알림은 끈다 — 배포 순서가 뒤집힌 경우", () => {
    expect(parseCancelResult(["m1"])).toEqual({ promoted: ["m1"], notifyOpenSeat: false });
  });

  it("알 수 없는 응답은 아무 일도 안 한 것으로 본다", () => {
    expect(parseCancelResult(null)).toEqual({ promoted: [], notifyOpenSeat: false });
    expect(parseCancelResult(undefined)).toEqual({ promoted: [], notifyOpenSeat: false });
    expect(parseCancelResult("x")).toEqual({ promoted: [], notifyOpenSeat: false });
  });

  it("문자열이 아닌 원소는 걸러낸다", () => {
    expect(parseCancelResult({ promoted: ["m1", 3, null], notify_open_seat: false }).promoted).toEqual([
      "m1",
    ]);
  });
});
