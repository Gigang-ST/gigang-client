import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { isImminentGathering } from "@/lib/gathering/imminent";

// 기준 시각: 2026-07-20 12:00 KST
const NOW = "2026-07-20T12:00:00+09:00";

describe("isImminentGathering", () => {
  it("11시간 59분 남았으면 임박(true)", () => {
    expect(isImminentGathering("2026-07-20T23:59", NOW)).toBe(true);
  });

  it("정확히 12시간 남았으면 임박 아님(false) — 경계값", () => {
    expect(isImminentGathering("2026-07-21T00:00", NOW)).toBe(false);
  });

  it("12시간 1분 남았으면 임박 아님(false)", () => {
    expect(isImminentGathering("2026-07-21T00:01", NOW)).toBe(false);
  });

  it("1시간만 남았으면 임박(true)", () => {
    expect(isImminentGathering("2026-07-20T13:00", NOW)).toBe(true);
  });

  it("정확히 지금 시작이면 임박 아님(false) — 이미 시작한 것으로 취급", () => {
    expect(isImminentGathering("2026-07-20T12:00", NOW)).toBe(false);
  });

  it("이미 지난 시각이면 임박 아님(false) — 지난 모임 수정 시 오탐 방지", () => {
    expect(isImminentGathering("2026-07-19T10:00", NOW)).toBe(false);
  });

  it("충분히 미래(며칠 뒤)면 임박 아님(false)", () => {
    expect(isImminentGathering("2026-07-25T12:00", NOW)).toBe(false);
  });

  it("값이 없으면 false", () => {
    expect(isImminentGathering(null, NOW)).toBe(false);
    expect(isImminentGathering(undefined, NOW)).toBe(false);
    expect(isImminentGathering("", NOW)).toBe(false);
  });

  it("유효하지 않은 날짜 문자열이면 false", () => {
    expect(isImminentGathering("not-a-date", NOW)).toBe(false);
  });

  it("now를 생략하면 실제 현재 시각 기준으로 동작한다", () => {
    const soon = dayjs().tz("Asia/Seoul").add(1, "hour").format("YYYY-MM-DDTHH:mm");
    expect(isImminentGathering(soon)).toBe(true);

    const far = dayjs().tz("Asia/Seoul").add(3, "day").format("YYYY-MM-DDTHH:mm");
    expect(isImminentGathering(far)).toBe(false);
  });
});
