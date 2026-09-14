import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  GATHERING_CANCEL_IMMINENT_HOURS,
  GATHERING_WAITLIST_OPEN_HOURS,
  isCancelReasonRequired,
  isWaitlistOpenToAll,
} from "@/lib/gathering/cancel-imminent";

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

  describe("날짜만 있는 입력(start_date 폴백)은 KST 자정 기준으로 해석", () => {
    // "2026-07-20"(date-only) = KST 자정 = UTC 2026-07-19T15:00:00Z. 실행 환경 TZ와 무관해야 한다.
    const dateOnly = "2026-07-20";
    const kstMidnightUtc = "2026-07-19T15:00:00Z";

    it("KST 자정까지 5시간보다 더 남았으면 사유 선택", () => {
      expect(isCancelReasonRequired(dateOnly, dayjs(kstMidnightUtc).subtract(6, "hour"))).toBe(false);
    });

    it("KST 자정까지 5시간 이내면 사유 필수", () => {
      expect(isCancelReasonRequired(dateOnly, dayjs(kstMidnightUtc).subtract(1, "hour"))).toBe(true);
    });
  });
});

describe("isWaitlistOpenToAll — 시작 2시간 전부터 대기 순번이 없어진다", () => {
  const sttAt = "2026-09-11T10:00:00Z"; // KST 19:00

  it("2시간보다 더 남았으면 false(아직 대기 순번이 산다)", () => {
    const now = dayjs(sttAt).subtract(GATHERING_WAITLIST_OPEN_HOURS, "hour").subtract(1, "minute");
    expect(isWaitlistOpenToAll(sttAt, now)).toBe(false);
  });

  it("정확히 2시간 남았으면 false — 경계는 미만일 때만 열린다", () => {
    const now = dayjs(sttAt).subtract(GATHERING_WAITLIST_OPEN_HOURS, "hour");
    expect(isWaitlistOpenToAll(sttAt, now)).toBe(false);
  });

  it("2시간에서 1분 모자라면 true(선착순 구간)", () => {
    const now = dayjs(sttAt).subtract(GATHERING_WAITLIST_OPEN_HOURS, "hour").add(1, "minute");
    expect(isWaitlistOpenToAll(sttAt, now)).toBe(true);
  });

  it("이미 시작했으면 true", () => {
    expect(isWaitlistOpenToAll(sttAt, dayjs(sttAt).add(1, "hour"))).toBe(true);
  });

  it("취소 사유 경계(5시간)와 다른 값이다 — 둘은 성격이 다른 규칙이다", () => {
    expect(GATHERING_WAITLIST_OPEN_HOURS).toBe(2);
    expect(GATHERING_WAITLIST_OPEN_HOURS).not.toBe(GATHERING_CANCEL_IMMINENT_HOURS);
  });

  it("5시간 남은 시점은 취소 사유 경계에는 걸려도 대기 순번은 살아 있다", () => {
    const now = dayjs(sttAt).subtract(4, "hour");
    expect(isCancelReasonRequired(sttAt, now)).toBe(true);
    expect(isWaitlistOpenToAll(sttAt, now)).toBe(false);
  });

  it("날짜만 온 경우에도 KST 자정 기준으로 판정한다", () => {
    const dateOnly = "2026-09-12";
    const kstMidnightUtc = "2026-09-11T15:00:00Z";
    expect(isWaitlistOpenToAll(dateOnly, dayjs(kstMidnightUtc).subtract(1, "hour"))).toBe(true);
    expect(isWaitlistOpenToAll(dateOnly, dayjs(kstMidnightUtc).subtract(3, "hour"))).toBe(false);
  });
});
