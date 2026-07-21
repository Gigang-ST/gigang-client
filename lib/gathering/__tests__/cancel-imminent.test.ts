import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { GATHERING_CANCEL_IMMINENT_HOURS, isCancelReasonRequired } from "@/lib/gathering/cancel-imminent";

describe("isCancelReasonRequired", () => {
  const sttAt = "2026-07-20T10:00:00Z";

  it("정확히 5시간 전이면 아직 임박 아님(사유 선택)", () => {
    const now = dayjs(sttAt).subtract(GATHERING_CANCEL_IMMINENT_HOURS, "hour");
    expect(isCancelReasonRequired(sttAt, now)).toBe(false);
  });

  it("5시간에서 1분 모자라면 임박(사유 필수)", () => {
    const now = dayjs(sttAt).subtract(GATHERING_CANCEL_IMMINENT_HOURS, "hour").add(1, "minute");
    expect(isCancelReasonRequired(sttAt, now)).toBe(true);
  });

  it("5시간보다 많이 남았으면 임박 아님(사유 선택)", () => {
    const now = dayjs(sttAt).subtract(6, "hour");
    expect(isCancelReasonRequired(sttAt, now)).toBe(false);
  });

  it("시작 직전(몇 분 전)이면 임박(사유 필수)", () => {
    const now = dayjs(sttAt).subtract(10, "minute");
    expect(isCancelReasonRequired(sttAt, now)).toBe(true);
  });

  it("이미 시작 시각이 지났어도 임박(사유 필수) 취급", () => {
    const now = dayjs(sttAt).add(30, "minute");
    expect(isCancelReasonRequired(sttAt, now)).toBe(true);
  });

  it("now 생략 시 현재 시각 기준으로 판단한다", () => {
    const farFuture = dayjs().add(10, "hour").toISOString();
    expect(isCancelReasonRequired(farFuture)).toBe(false);

    const imminent = dayjs().add(1, "hour").toISOString();
    expect(isCancelReasonRequired(imminent)).toBe(true);
  });
});
