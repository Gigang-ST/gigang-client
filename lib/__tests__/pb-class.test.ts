/**
 * 겨울 10K PB 클래스 환급 계산 — 사람 돈이 걸린 숫자라 경계를 못박는다.
 * 규칙 정본: GitHub #577 본문 + 보강 댓글(2026-10-07 오너 확정).
 */
import { describe, expect, it } from "vitest";

import {
  PB_CLASS_DEFAULT_CFG as CFG,
  countAttd,
  buildSessStrip,
  feesForJoinWeek,
  isSessHeld,
  isLateJoin,
  refundAmt,
  remainingSessCnt,
  requiredAttdCnt,
  summarizeRefund,
  weekNoOf,
  type PbSessLink,
} from "@/lib/pb-class";

/** W1~W12 공식훈련 + W14 측정(13번째 회차가 14주차에 놓이는 경우) */
const LINKS: PbSessLink[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    gthrId: `t${i + 1}`,
    wkNo: i + 1,
    sessType: "TRAINING" as const,
    held: true,
  })),
  { gthrId: "m", wkNo: 14, sessType: "MEASURE" as const, held: true },
];

describe("weekNoOf — 수요일 00:00 KST 경계", () => {
  const W1 = "2026-11-04"; // 수요일

  it("W1 수요일 19:30 KST = 1주차", () => {
    expect(weekNoOf("2026-11-04T10:30:00Z", W1)).toBe(1);
  });

  it("화요일 23:59 KST까지 같은 주, 수요일 00:00 KST부터 다음 주", () => {
    // 11/10(화) 23:59 KST = 11/10 14:59 UTC
    expect(weekNoOf("2026-11-10T14:59:00Z", W1)).toBe(1);
    // 11/11(수) 00:00 KST = 11/10 15:00 UTC — UTC 날짜로 세면 아직 1주차로 오판한다
    expect(weekNoOf("2026-11-10T15:00:00Z", W1)).toBe(2);
  });

  it("W12 = 1/20, 측정 W13 = 1/27 · W14 = 2/3", () => {
    expect(weekNoOf("2027-01-20T10:30:00Z", W1)).toBe(12);
    expect(weekNoOf("2027-01-27T10:30:00Z", W1)).toBe(13);
    expect(weekNoOf("2027-02-03T10:30:00Z", W1)).toBe(14);
  });

  it("W1 이전은 0 이하", () => {
    expect(weekNoOf("2026-11-03T10:30:00Z", W1)).toBeLessThanOrEqual(0);
  });
});

describe("requiredAttdCnt — floor(남은 회차 × 9 ÷ 13)", () => {
  it.each([
    [1, 9],
    [2, 8],
    [3, 7],
    [4, 6],
    [5, 6],
  ])("W%i 합류 → %i회", (wk, req) => {
    expect(requiredAttdCnt(wk, CFG)).toBe(req);
  });

  it("W6 이후 합류는 환급 없음(null)", () => {
    expect(isLateJoin(5, CFG)).toBe(false);
    expect(isLateJoin(6, CFG)).toBe(true);
    expect(requiredAttdCnt(6, CFG)).toBeNull();
    expect(requiredAttdCnt(10, CFG)).toBeNull();
  });

  it("남은 회차는 측정일 포함 산술값 — W3 합류면 11회", () => {
    expect(remainingSessCnt(1, CFG)).toBe(13);
    expect(remainingSessCnt(3, CFG)).toBe(11);
  });
});

describe("refundAmt — 3만 × min(출석, 기준) ÷ 기준, 원 단위 내림", () => {
  it("정식 참가자: 9회 이상이면 전액, 그 아래는 비례", () => {
    expect(refundAmt(30_000, 13, 9)).toBe(30_000);
    expect(refundAmt(30_000, 9, 9)).toBe(30_000);
    expect(refundAmt(30_000, 1, 9)).toBe(3_333);
    expect(refundAmt(30_000, 0, 9)).toBe(0);
  });

  it("W3 합류(기준 7): 7회면 전액", () => {
    expect(refundAmt(30_000, 7, 7)).toBe(30_000);
    expect(refundAmt(30_000, 3, 7)).toBe(12_857);
  });

  it("보증금이 0이거나 기준이 없으면 0원", () => {
    expect(refundAmt(0, 9, 9)).toBe(0);
    expect(refundAmt(30_000, 9, null)).toBe(0);
  });
});

describe("countAttd — 합류 전 주차는 세지 않는다", () => {
  const attended = new Set(["t1", "t2", "t3", "t5", "m"]);

  it("정식 참가자는 지정 벙 전부에서 센다", () => {
    expect(countAttd(LINKS, attended, 1)).toBe(5);
  });

  it("W3 합류자는 W1·W2 참석을 빼고 센다(비참가자로 나온 것)", () => {
    expect(countAttd(LINKS, attended, 3)).toBe(3);
  });

  it("지정되지 않은 벙 참석은 출석이 아니다", () => {
    expect(countAttd(LINKS, new Set(["other-bung"]), 1)).toBe(0);
  });

  it("아직 안 열린 회차의 참석 예약은 출석이 아니다", () => {
    const upcoming = LINKS.map((l) => (l.wkNo >= 3 ? { ...l, held: false } : l));
    expect(countAttd(upcoming, attended, 1)).toBe(2);
  });
});

describe("isSessHeld", () => {
  const NOW = "2026-11-11T10:00:00Z"; // 11/11 19:00 KST

  it("시작 시각이 지난 벙만 열린 회차", () => {
    expect(isSessHeld({ stt_at: "2026-11-04T10:30:00Z", del_yn: false }, NOW)).toBe(true);
    expect(isSessHeld({ stt_at: "2026-11-11T10:30:00Z", del_yn: false }, NOW)).toBe(false);
  });

  it("삭제된 벙(한파 취소)은 열리지 않은 것으로 본다", () => {
    expect(isSessHeld({ stt_at: "2026-11-04T10:30:00Z", del_yn: true }, NOW)).toBe(false);
  });

  it("DB timestamptz 형식(+00)도 같은 순간으로 읽는다", () => {
    expect(isSessHeld({ stt_at: "2026-11-11 09:59:00+00", del_yn: false }, NOW)).toBe(true);
  });
});

describe("summarizeRefund", () => {
  it("한파로 한 회차 연결을 빼도 기준(분모)은 그대로다", () => {
    const withoutW7 = LINKS.filter((l) => l.wkNo !== 7);
    const all = new Set(LINKS.map((l) => l.gthrId));
    const s = summarizeRefund({
      joinWkNo: 1,
      dpstAmt: 30_000,
      links: withoutW7,
      attendedGthrIds: all,
      cfg: CFG,
    });
    expect(s.required).toBe(9);
    expect(s.attdCnt).toBe(12);
    expect(s.refund).toBe(30_000);
    expect(s.toFull).toBe(0);
    expect(s.unrefunded).toBe(0);
  });

  it("4회 출석 정식 참가자: 13,333원 환급, 16,667원 미환급, 전액까지 5회", () => {
    const s = summarizeRefund({
      joinWkNo: 1,
      dpstAmt: 30_000,
      links: LINKS,
      attendedGthrIds: new Set(["t1", "t2", "t3", "t4"]),
      cfg: CFG,
    });
    expect(s).toMatchObject({ attdCnt: 4, required: 9, toFull: 5, refund: 13_333, unrefunded: 16_667 });
  });

  it("늦은 합류자는 출석은 세되 환급·전액까지는 없음", () => {
    const s = summarizeRefund({
      joinWkNo: 7,
      dpstAmt: 0,
      links: LINKS,
      attendedGthrIds: new Set(["t7", "t8"]),
      cfg: CFG,
    });
    expect(s).toMatchObject({ late: true, attdCnt: 2, required: null, toFull: null, refund: 0, unrefunded: 0 });
  });
});

describe("buildSessStrip", () => {
  const links = [
    { gthrId: "t1", wkNo: 1, sessType: "TRAINING" as const, held: true, delYn: false },
    { gthrId: "t2", wkNo: 2, sessType: "TRAINING" as const, held: true, delYn: false },
    { gthrId: "t3", wkNo: 3, sessType: "TRAINING" as const, held: false, delYn: true },
    { gthrId: "t4", wkNo: 4, sessType: "TRAINING" as const, held: false, delYn: false },
    { gthrId: "m", wkNo: 14, sessType: "MEASURE" as const, held: false, delYn: false },
  ];

  it("훈련 12칸 + 측정 1칸, 상태가 칸마다 갈린다", () => {
    const strip = buildSessStrip({ links, attendedGthrIds: new Set(["t1"]), joinWkNo: 1, cfg: CFG });
    expect(strip).toHaveLength(13);
    expect(strip.map((c) => c.state).slice(0, 5)).toEqual([
      "attended",
      "missed",
      "canceled",
      "upcoming",
      "unlinked",
    ]);
    expect(strip[12]).toMatchObject({ label: "측정", wkNo: 14, state: "upcoming" });
  });

  it("합류 전 주차는 출석했어도 before_join", () => {
    const strip = buildSessStrip({ links, attendedGthrIds: new Set(["t1", "t2"]), joinWkNo: 2, cfg: CFG });
    expect(strip[0].state).toBe("before_join");
    expect(strip[1].state).toBe("attended");
  });

  it("측정이 아직 지정 안 됐으면 마지막 칸은 unlinked", () => {
    const strip = buildSessStrip({ links: links.slice(0, 2), attendedGthrIds: new Set(), joinWkNo: 1, cfg: CFG });
    expect(strip[12]).toMatchObject({ wkNo: null, gthrId: null, state: "unlinked" });
  });
});

describe("feesForJoinWeek", () => {
  it("W5까지 4만 원(보증금 3만 + 참가비 1만), W6부터 1만 원", () => {
    expect(feesForJoinWeek(1, CFG)).toEqual({ dpstAmt: 30_000, entryFeeAmt: 10_000 });
    expect(feesForJoinWeek(5, CFG)).toEqual({ dpstAmt: 30_000, entryFeeAmt: 10_000 });
    expect(feesForJoinWeek(6, CFG)).toEqual({ dpstAmt: 0, entryFeeAmt: 10_000 });
  });
});
