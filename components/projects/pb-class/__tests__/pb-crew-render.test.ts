import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG as CFG, summarizeRefund } from "@/lib/pb-class";
import { buildPbCrewAttd } from "@/lib/pb-class-chart";
import type { PbClassBoard, PbParticipant, PbSession } from "@/lib/queries/pb-class";

import { PbCrewAttendance, PbCrewEmpty } from "@/components/projects/pb-class/pb-crew-attendance";
import { PbCrewChart } from "@/components/projects/pb-class/pb-crew-chart";
import { PbCrewTable } from "@/components/projects/pb-class/pb-crew-table";

// 그래프는 클라이언트 전용 동적 로드(ssr:false)라 서버 마크업엔 안 그려진다 — 자리만 확인한다
vi.mock("@/components/projects/pb-class/pb-crew-chart-dynamic", () => ({
  PbCrewChartDynamic: () => createElement("div", { "data-crew-chart": "" }),
}));

/**
 * PB 「크루 출석」 — 출석표가 빈 칸의 뜻(합류 전·취소·예정)을 모양으로 갈라 말하는지,
 * 나를 짚는지, 정산과 같은 공개 범위(입금 대기자 제외)를 지키는지 마크업으로 못박는다.
 * 계산 경계는 `lib/__tests__/pb-class-chart.test.ts`가 지킨다.
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
    depositDcAmt: 0,
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

    expect(out).toContain("같이 나온 기록");
    expect(out).toMatch(/4주차엔 3명 중 <span[^>]*>2명<\/span>이 나왔어요/);
    expect(out).toContain("누적 출석"); // 세그먼트
    expect(out).toContain("출석표");
    expect(out).toContain("data-crew-chart"); // 기본은 그래프
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
});

describe("PbCrewTable", () => {
  const sessions = makeSessions(5, { canceled: [3] });
  const crew = buildPbCrewAttd({
    sessions,
    participants: [
      makePrt("z", "하늘", ["g1"], sessions),
      makePrt("me", "홍길동", ["g1", "g2", "g4"], sessions),
      makePrt("mid", "가람", ["g4", "g5"], sessions, { joinWkNo: 4 }),
      makePrt("pend", "대기자", [], sessions, { aprvYn: false }),
    ],
    cfg: CFG,
    myMemId: "me",
  });
  const out = html(createElement(PbCrewTable, { crew }));

  it("나를 맨 위에 짚고, 입금 대기자는 싣지 않는다", () => {
    const body = out.slice(out.indexOf("<tbody"), out.indexOf("</tbody>"));
    const names = [...body.matchAll(/<th scope="row"[^>]*><span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(names).toEqual(["홍길동", "가람", "하늘"]);
    expect(out).toContain("(나)");
    expect(out).not.toContain("대기자");
  });

  it("칸마다 상태를 스크린리더 글로 말한다 — 합류 전은 결석이 아니다", () => {
    expect(out).toContain("1주차 출석");
    expect(out).toContain("2주차 결석"); // 하늘
    expect(out).toContain("1주차 합류 전"); // 가람(4주차 합류)
    expect(out).toContain("3주차 취소");
    expect(out).toContain("6주차 예정");
  });

  it("취소된 회차는 머리줄 눈금에 취소선을 긋고 열 전체에 띠를 깐다", () => {
    expect(out).toMatch(/line-through[^"]*"[^>]*>3</);
    expect(out).toContain("var(--muted)_75%");
    expect(out).toContain("취소된 회차"); // 범례 — 취소가 있을 때만
  });

  it("맨 아래 줄이 회차별 나온 인원을 센다(열린 회차만)", () => {
    expect(out).toContain(">인원<");
    const foot = out.slice(out.indexOf("<tfoot"));
    const counts = [...foot.matchAll(/<td[^>]*><span[^>]*>(\d+)<\/span><\/td>/g)].map((m) => Number(m[1]));
    expect(counts).toEqual([2, 1, 2, 1]); // 1·2·4·5주차 — 3주차(취소)·6주차~(예정)는 비운다
  });

  it("취소가 없으면 취소 범례를 세우지 않는다", () => {
    const s = makeSessions(2);
    const c = buildPbCrewAttd({ sessions: s, participants: [makePrt("me", "홍길동", ["g1"], s)], cfg: CFG, myMemId: "me" });
    const o = html(createElement(PbCrewTable, { crew: c }));
    expect(o).not.toContain("취소된 회차");
    expect(o).not.toContain(">합류 전<"); // 합류 전 범례도 중간 합류자가 있을 때만
  });

  it("전액 기준을 채운 사람은 체크와 함께 「전액 확보」를 말하고, 늦은 합류는 기준 없이 횟수만", () => {
    const s = makeSessions(9);
    const c = buildPbCrewAttd({
      sessions: s,
      participants: [makePrt("me", "홍길동", ALL9, s), makePrt("l", "늦둥", ["g6", "g7"], s, { joinWkNo: 6 })],
      cfg: CFG,
      myMemId: "me",
    });
    const o = html(createElement(PbCrewTable, { crew: c }));
    expect(o).toContain("전액 확보");
    expect(o).toMatch(/text-success[^>]*>.*9<\/span>/);
    const lateRow = o.slice(o.indexOf("늦둥"));
    expect(lateRow.slice(0, lateRow.indexOf("</tr>"))).not.toContain("전액 확보");
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
    expect(out).not.toContain("가람"); // 그래프는 이름을 늘어놓지 않는다(이름은 출석표 몫)
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
