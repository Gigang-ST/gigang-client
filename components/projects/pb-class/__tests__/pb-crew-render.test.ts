import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG as CFG, summarizeRefund } from "@/lib/pb-class";
import { buildPbCrewAttd } from "@/lib/pb-class-chart";
import type { PbClassBoard, PbParticipant, PbSession } from "@/lib/queries/pb-class";

import { PbCrewAttendance, PbCrewEmpty, PbCrewFailed } from "@/components/projects/pb-class/pb-crew-attendance";
import { PbCrewChart } from "@/components/projects/pb-class/pb-crew-chart";

// 그래프는 클라이언트 전용 동적 로드(ssr:false)라 서버 마크업엔 안 그려진다 — 자리만 확인한다
vi.mock("@/components/projects/pb-class/pb-crew-chart-dynamic", () => ({
  PbCrewChartDynamic: () => createElement("div", { "data-crew-chart": "" }),
}));

/**
 * PB 「누적 출석」 면 — 점수판 맨 아래 Week by Week 칸의 한 면. 한 줄 요약이 크루 상태를 먼저 말하는지,
 * 그래프가 이름을 늘어놓지 않는지 마크업으로 못박는다. 출석표(이름 × 회차)는 오너가 걷었다(2026-10-08).
 * 칸 머리·세그먼트는 `pb-scoreboard-charts-render.test.ts`가, 계산 경계는 `lib/__tests__/pb-class-chart.test.ts`가 지킨다.
 */

function makeSessions(heldThrough: number, opts: { canceled?: number[] } = {}): PbSession[] {
  const w1 = dayjs("2026-11-04T19:30:00+09:00");
  return Array.from({ length: 13 }, (_, i) => {
    const wk = i + 1;
    const delYn = (opts.canceled ?? []).includes(wk);
    return {
      gthrId: `g${wk}`,
      wkNo: wk,
      sessType: wk === 13 ? ("MEASURE" as const) : ("TRAINING" as const),
      held: !delYn && wk <= heldThrough,
      gthrNm: `${wk}주차 훈련`,
      sttAt: w1.add(i * 7, "day").toISOString(),
      delYn,
      computedWkNo: wk,
      attdCnt: 0,
    };
  });
}

function makePrt(
  memId: string,
  memNm: string,
  attended: string[],
  sessions: PbSession[],
  opts: { joinWkNo?: number; aprvYn?: boolean } = {},
): PbParticipant {
  const joinWkNo = opts.joinWkNo ?? 1;
  const depositAmt = joinWkNo >= CFG.lateJoinWkNo ? 0 : CFG.depositAmt;
  return {
    prtId: `p-${memId}`,
    memId,
    memNm,
    avatarUrl: null,
    joinWkNo,
    depositAmt,
    entryFeeAmt: CFG.entryFeeAmt,
    entryFeeDcAmt: 0,
    aprvYn: opts.aprvYn ?? true,
    aprvAt: null,
    summary: summarizeRefund({ joinWkNo, depositAmt, links: sessions, attendedGthrIds: new Set(attended), cfg: CFG }),
    attendedGthrIds: attended,
  };
}

function makeBoard(sessions: PbSession[], participants: PbParticipant[]): PbClassBoard {
  return {
    evt: { evtId: "e1", evtNm: "겨울 10K PB 클래스", sttDt: "2026-11-04", endDt: "2027-02-09", sttsEnm: "ACTIVE" },
    cfg: CFG,
    cfgSaved: true,
    sessions,
    participants,
    totals: { aprvCnt: 0, pendingCnt: 0, depositSum: 0, refundSum: 0, unrefundedSum: 0, entryFeeSum: 0 },
    sessPlans: [],
  };
}

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const ALL9 = ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9"];

describe("PbCrewAttendance", () => {
  it("한 줄 요약이 마지막 열린 회차의 인원을 먼저 말하고, 그래프 자리를 세운다", () => {
    const sessions = makeSessions(4);
    const board = makeBoard(sessions, [
      makePrt("me", "홍길동", ["g1", "g2", "g4"], sessions),
      makePrt("a", "가람", ["g1", "g4"], sessions),
      makePrt("b", "나래", ["g1"], sessions),
    ]);
    const out = html(createElement(PbCrewAttendance, { board, myMemId: "me" }));

    expect(out).toMatch(/4주차엔 3명 중 <span[^>]*>2명<\/span>이 나왔어요/);
    expect(out).toContain("data-crew-chart");
    expect(out.indexOf("나왔어요")).toBeLessThan(out.indexOf("data-crew-chart")); // 상태 먼저, 근거(그래프) 뒤
    // 면만 그린다 — 칸 머리와 세그먼트는 Week by Week 칸(PbFlowZone)의 몫. 출석표는 없다
    expect(out).not.toContain("<section");
    expect(out).not.toContain("출석표");
  });

  it("전원이 나온 회차는 「모두 나왔어요」, 전액 확보가 있으면 덧붙인다", () => {
    const sessions = makeSessions(9);
    const board = makeBoard(sessions, [
      makePrt("me", "홍길동", ALL9, sessions),
      makePrt("a", "가람", ["g9"], sessions),
    ]);
    const out = html(createElement(PbCrewAttendance, { board, myMemId: "me" }));

    expect(out).toMatch(/9주차엔 <span[^>]*>2명<\/span> 모두 나왔어요/);
    expect(out).toMatch(/전액 확보 <span[^>]*>1명<\/span>/);
  });

  it("열린 회차가 없으면 빈 상태가 선다", () => {
    const sessions = makeSessions(0);
    const board = makeBoard(sessions, [makePrt("me", "홍길동", [], sessions)]);
    const out = html(createElement(PbCrewAttendance, { board, myMemId: "me" }));

    expect(out).toContain("첫 공식훈련이 끝나면 그려져요");
    expect(out).not.toContain("data-crew-chart");
    expect(html(createElement(PbCrewEmpty))).toContain("첫 공식훈련이 끝나면 그려져요");
  });

  it("보드 조회가 흔들리면 빈칸 대신 안내 — 세그먼트 아래가 비면 고장 난 화면처럼 보인다", () => {
    expect(html(createElement(PbCrewFailed))).toContain("출석 기록을 불러오지 못했어요");
  });
});

describe("PbCrewChart — 범례 겸 판독값", () => {
  it("나·크루 평균·내 전액 기준을 지금 값과 함께 단다", () => {
    const sessions = makeSessions(3);
    const crew = buildPbCrewAttd({
      sessions,
      participants: [makePrt("me", "홍길동", ["g1", "g2"], sessions), makePrt("a", "가람", ["g1", "g2", "g3"], sessions)],
      cfg: CFG,
      myMemId: "me",
    });
    const out = html(createElement(PbCrewChart, { crew }));

    expect(out).toContain("나 2회, 크루 평균 2.5회, 전액 기준 9회");
    expect(out).not.toContain("가람"); // 그래프는 이름을 늘어놓지 않는다(출석표를 걷은 뒤에도 — 남의 출석을 이름으로 대지 않는다)
  });

  it("늦은 합류인 나에겐 기준선 범례가 없다", () => {
    const sessions = makeSessions(7);
    const crew = buildPbCrewAttd({
      sessions,
      participants: [makePrt("me", "홍길동", ["g6", "g7"], sessions, { joinWkNo: 6 })],
      cfg: CFG,
      myMemId: "me",
    });
    const out = html(createElement(PbCrewChart, { crew }));
    expect(out).not.toContain("전액 기준");
    expect(out).toContain("나 2회");
  });
});
