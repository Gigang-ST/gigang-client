import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  attendKey,
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

/** 지금 참석 중인 쌍이 없는 경우 */
const NONE: ReadonlySet<string> = new Set();

describe("summarizeCancels", () => {
  // a는 서로 다른 모임 둘을 취소, b는 하나
  const events: CancelEvent[] = [
    ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-01T00:00:00Z", sttAt: "2026-09-05T10:00:00Z" }),
    ev({ memId: "a", gthrId: "g2", evtAt: "2026-09-05T08:00:00Z", sttAt: "2026-09-05T10:00:00Z", reason: "야근" }),
    ev({ memId: "b", gthrId: "g3", evtAt: "2026-08-20T00:00:00Z", sttAt: "2026-09-02T10:00:00Z" }),
  ];

  it("회원별 취소·직전 수와 팀 합계를 센다", () => {
    const s = summarizeCancels(events, NONE);
    expect(s.total).toBe(3);
    expect(s.imminentTotal).toBe(1);
    expect(s.byMember.get("a")).toEqual({ cancelCnt: 2, imminentCnt: 1 });
    expect(s.byMember.get("b")).toEqual({ cancelCnt: 1, imminentCnt: 0 });
  });

  it("운영진이 뺀 것도 취소로 센다 — 대개 불참 정리라서", () => {
    const s = summarizeCancels(
      [ev({ memId: "d", evtAt: "2026-09-05T12:00:00Z", sttAt: "2026-09-05T10:00:00Z", actor: "admin" })],
      NONE,
    );
    expect(s.byMember.get("d")).toEqual({ cancelCnt: 1, imminentCnt: 1 });
    expect(s.records[0].actor).toBe("admin");
  });

  it("기록은 최신 취소부터 — 직전 여부가 붙는다", () => {
    const s = summarizeCancels(events, NONE);
    expect(s.records.map((r) => r.evtAt)).toEqual([
      "2026-09-05T08:00:00Z",
      "2026-09-01T00:00:00Z",
      "2026-08-20T00:00:00Z",
    ]);
    expect(s.records[0]).toMatchObject({ imminent: true, reason: "야근" });
  });

  it("기간은 모임 날짜가 아니라 취소한 시각 기준이다", () => {
    // b는 9월 모임을 8월에 취소 — 9월 통계에 들어가면 안 된다
    const s = summarizeCancels(events, NONE, {
      from: dayjs.tz("2026-09-01", KST),
      to: dayjs.tz("2026-10-01", KST),
    });
    expect(s.total).toBe(2);
    expect(s.byMember.has("b")).toBe(false);
  });

  it("기간 경계는 KST — 9/1 00:30 KST(8/31 UTC) 취소는 9월에 들어간다", () => {
    const s = summarizeCancels(
      [ev({ memId: "c", evtAt: "2026-08-31T15:30:00Z", sttAt: "2026-09-03T10:00:00Z" })],
      NONE,
      { from: dayjs.tz("2026-09-01", KST), to: dayjs.tz("2026-10-01", KST) },
    );
    expect(s.total).toBe(1);
  });
});

describe("summarizeCancels — 세는 단위는 이벤트가 아니라 (회원, 모임) 쌍", () => {
  const stt = "2026-09-20T10:00:00Z";

  it("⚠️ 같은 모임을 여러 번 취소해도 1번이다", () => {
    const s = summarizeCancels(
      [
        ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-10T00:00:00Z", sttAt: stt }),
        ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-12T00:00:00Z", sttAt: stt }),
        ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-15T00:00:00Z", sttAt: stt, reason: "마지막" }),
      ],
      NONE,
    );
    expect(s.byMember.get("a")).toEqual({ cancelCnt: 1, imminentCnt: 0 });
    // 남는 건 마지막 취소 — 사유·시각도 그 건
    expect(s.records).toHaveLength(1);
    expect(s.records[0]).toMatchObject({ evtAt: "2026-09-15T00:00:00Z", reason: "마지막" });
  });

  it("⚠️ 취소했다가 다시 참석했으면 취소가 아니다", () => {
    const s = summarizeCancels(
      [
        ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-10T00:00:00Z", sttAt: stt }),
        ev({ memId: "a", gthrId: "g2", evtAt: "2026-09-11T00:00:00Z", sttAt: stt }),
      ],
      new Set([attendKey("a", "g1")]),
    );
    expect(s.byMember.get("a")).toEqual({ cancelCnt: 1, imminentCnt: 0 });
    expect(s.records.map((r) => r.gthrId)).toEqual(["g2"]);
  });

  it("다른 사람의 참석은 내 취소를 지우지 않는다 — 쌍으로 판정한다", () => {
    const s = summarizeCancels(
      [ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-10T00:00:00Z", sttAt: stt })],
      new Set([attendKey("b", "g1")]),
    );
    expect(s.total).toBe(1);
  });

  it("직전 판정은 마지막 취소 기준 — 일찍 취소했다가 재참석 후 직전에 다시 취소하면 직전이다", () => {
    const s = summarizeCancels(
      [
        ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-18T00:00:00Z", sttAt: stt }),
        ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-20T08:00:00Z", sttAt: stt }),
      ],
      NONE,
    );
    expect(s.byMember.get("a")).toEqual({ cancelCnt: 1, imminentCnt: 1 });
  });

  it("⚠️ 기간은 마지막 취소 시각에 건다 — 9월 취소 후 10월에 다시 취소하면 10월에만 잡힌다", () => {
    const events = [
      ev({ memId: "a", gthrId: "g1", evtAt: "2026-09-25T00:00:00Z", sttAt: "2026-10-05T10:00:00Z" }),
      ev({ memId: "a", gthrId: "g1", evtAt: "2026-10-02T00:00:00Z", sttAt: "2026-10-05T10:00:00Z" }),
    ];
    const sep = summarizeCancels(events, NONE, {
      from: dayjs.tz("2026-09-01", KST),
      to: dayjs.tz("2026-10-01", KST),
    });
    const oct = summarizeCancels(events, NONE, {
      from: dayjs.tz("2026-10-01", KST),
      to: dayjs.tz("2026-11-01", KST),
    });
    expect(sep.total).toBe(0);
    expect(oct.total).toBe(1);
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
