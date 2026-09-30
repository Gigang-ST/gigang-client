import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  cancelRate,
  isImminentCancel,
  summarizeCancels,
  type CancelEvent,
} from "@/lib/gathering/cancel-stats";

const KST = "Asia/Seoul";

function ev(p: Partial<CancelEvent> & { memId: string; evtAt: string; sttAt: string }): CancelEvent {
  return { gthrId: "g1", gthrNm: "모임", reason: null, actor: "self", ...p };
}

describe("isImminentCancel — 시작 5시간 이내 취소", () => {
  const stt = "2026-09-10T10:00:00Z";

  it("정확히 5시간 전 취소는 직전이 아니다", () => {
    expect(isImminentCancel("2026-09-10T05:00:00Z", stt)).toBe(false);
  });

  it("4시간 59분 전 취소는 직전이다", () => {
    expect(isImminentCancel("2026-09-10T05:01:00Z", stt)).toBe(true);
  });

  it("시작 후 취소도 직전으로 본다", () => {
    expect(isImminentCancel("2026-09-10T11:00:00Z", stt)).toBe(true);
  });
});

describe("summarizeCancels", () => {
  const events: CancelEvent[] = [
    ev({ memId: "a", evtAt: "2026-09-01T00:00:00Z", sttAt: "2026-09-05T10:00:00Z" }),
    ev({ memId: "a", evtAt: "2026-09-05T08:00:00Z", sttAt: "2026-09-05T10:00:00Z", reason: "야근" }),
    ev({ memId: "b", evtAt: "2026-08-20T00:00:00Z", sttAt: "2026-09-02T10:00:00Z" }),
  ];

  it("회원별 취소·직전 수와 팀 합계를 센다", () => {
    const s = summarizeCancels(events);
    expect(s.total).toBe(3);
    expect(s.imminentTotal).toBe(1);
    expect(s.byMember.get("a")).toEqual({ cancelCnt: 2, imminentCnt: 1 });
    expect(s.byMember.get("b")).toEqual({ cancelCnt: 1, imminentCnt: 0 });
  });

  it("운영진이 뺀 것도 취소로 센다 — 대개 불참 정리라서", () => {
    const s = summarizeCancels([
      ev({ memId: "d", evtAt: "2026-09-05T12:00:00Z", sttAt: "2026-09-05T10:00:00Z", actor: "admin" }),
    ]);
    expect(s.byMember.get("d")).toEqual({ cancelCnt: 1, imminentCnt: 1 });
    expect(s.records[0].actor).toBe("admin");
  });

  it("기록은 최신 취소부터 — 직전 여부가 붙는다", () => {
    const s = summarizeCancels(events);
    expect(s.records.map((r) => r.evtAt)).toEqual([
      "2026-09-05T08:00:00Z",
      "2026-09-01T00:00:00Z",
      "2026-08-20T00:00:00Z",
    ]);
    expect(s.records[0]).toMatchObject({ imminent: true, reason: "야근" });
  });

  it("기간은 모임 날짜가 아니라 취소한 시각 기준이다", () => {
    // b는 9월 모임을 8월에 취소 — 9월 통계에 들어가면 안 된다
    const s = summarizeCancels(events, {
      from: dayjs.tz("2026-09-01", KST),
      to: dayjs.tz("2026-10-01", KST),
    });
    expect(s.total).toBe(2);
    expect(s.byMember.has("b")).toBe(false);
  });

  it("기간 경계는 KST — 9/1 00:30 KST(8/31 UTC) 취소는 9월에 들어간다", () => {
    const s = summarizeCancels(
      [ev({ memId: "c", evtAt: "2026-08-31T15:30:00Z", sttAt: "2026-09-03T10:00:00Z" })],
      { from: dayjs.tz("2026-09-01", KST), to: dayjs.tz("2026-10-01", KST) },
    );
    expect(s.total).toBe(1);
  });
});

describe("cancelRate", () => {
  it("취소 ÷ (참석 + 취소)", () => {
    expect(cancelRate(3, 1)).toBe(25);
    expect(cancelRate(0, 2)).toBe(100);
  });

  it("참석도 취소도 없으면 null — 0%로 찍지 않는다", () => {
    expect(cancelRate(0, 0)).toBeNull();
  });
});
