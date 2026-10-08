/**
 * PB 클래스 「크루 출석」 그래프·출석표 계산 — 빈 칸의 뜻(합류 전·취소·예정)이 0과 섞이지 않는지 못박는다.
 * 금액은 다루지 않는다(환급은 `pb-class.test.ts`). 여기서 지키는 건 「누가 언제 나왔나」를 그리는 모양이다.
 */
import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG as CFG, summarizeRefund } from "@/lib/pb-class";
import {
  buildPbCrewAttd,
  crewGlance,
  crewYTicks,
  formatCnt,
  toPbCrewChartData,
} from "@/lib/pb-class-chart";
import type { PbParticipant, PbSession } from "@/lib/queries/pb-class";

/** W1~W12 공식훈련 + 13주차 측정. `heldThrough` 주차까지 열렸다. W1 = 2026-11-04(수) 19:30 KST */
function makeSessions(heldThrough: number, opts: { canceled?: number[]; unlinked?: number[] } = {}): PbSession[] {
  const w1 = dayjs("2026-11-04T19:30:00+09:00");
  return Array.from({ length: 13 }, (_, i) => i + 1)
    .filter((wk) => !(opts.unlinked ?? []).includes(wk))
    .map((wk) => {
      const delYn = (opts.canceled ?? []).includes(wk);
      return {
        gthrId: `g${wk}`,
        wkNo: wk,
        sessType: wk === 13 ? ("MEASURE" as const) : ("TRAINING" as const),
        held: !delYn && wk <= heldThrough,
        gthrNm: `${wk}주차 훈련`,
        sttAt: w1.add((wk - 1) * 7, "day").toISOString(),
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
    attendedGthrIds: sessions.filter((s) => attended.includes(s.gthrId)).map((s) => s.gthrId),
  };
}

describe("buildPbCrewAttd — 열(회차)", () => {
  it("1~12주차 + 측정 13열을 늘 세우고, 눈금은 숫자·「측정」이다", () => {
    const sessions = makeSessions(3);
    const crew = buildPbCrewAttd({ sessions, participants: [], cfg: CFG });

    expect(crew.columns).toHaveLength(13);
    expect(crew.columns.map((c) => c.tick)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "측정",
    ]);
    expect(crew.columns[0].label).toBe("1주차");
    expect(crew.columns[12].label).toBe("측정");
    expect(crew.columns[0].dt).toBe("11/4"); // KST 날짜 — UTC 로 찍혔으면 하루 밀린다
  });

  it("열린 회차만 인원을 세고, 예정·미정·취소는 null 이다(0명과 다르다)", () => {
    const sessions = makeSessions(4, { canceled: [3], unlinked: [6] });
    const a = makePrt("a", "가나", ["g1", "g2", "g4"], sessions);
    const b = makePrt("b", "다라", ["g1"], sessions);
    const crew = buildPbCrewAttd({ sessions, participants: [a, b], cfg: CFG });

    expect(crew.columns.map((c) => c.state).slice(0, 7)).toEqual([
      "held", "held", "canceled", "held", "upcoming", "unlinked", "upcoming",
    ]);
    expect(crew.columns[0].attdCnt).toBe(2);
    expect(crew.columns[1].attdCnt).toBe(1);
    expect(crew.columns[2].attdCnt).toBeNull(); // 취소 — 아무도 안 나온 게 아니라 회차가 없었다
    expect(crew.columns[2].dt).toBeNull(); // 취소된 벙 시각은 지어낸 값일 수 있어 찍지 않는다
    expect(crew.columns[4].attdCnt).toBeNull(); // 아직 안 열림
    expect(crew.heldCnt).toBe(3);
    expect(crew.lastHeldIdx).toBe(3);
  });

  it("분모는 그 회차에 이미 합류해 있던 사람만이다", () => {
    const sessions = makeSessions(4);
    const reg = makePrt("a", "가나", ["g1", "g3"], sessions);
    const mid = makePrt("b", "다라", ["g3", "g4"], sessions, { joinWkNo: 3 });
    const crew = buildPbCrewAttd({ sessions, participants: [reg, mid], cfg: CFG });

    expect(crew.columns[0].eligibleCnt).toBe(1);
    expect(crew.columns[2].eligibleCnt).toBe(2);
    expect(crew.columns[2].attdCnt).toBe(2);
  });
});

describe("buildPbCrewAttd — 행(참가자)", () => {
  it("승인된 참가자만, 나를 맨 위에 두고 나머지는 이름순이다", () => {
    const sessions = makeSessions(2);
    const crew = buildPbCrewAttd({
      sessions,
      participants: [
        makePrt("c", "하늘", [], sessions),
        makePrt("me", "홍길동", ["g1"], sessions),
        makePrt("a", "가람", ["g1", "g2"], sessions),
        makePrt("p", "대기중", [], sessions, { aprvYn: false }),
      ],
      cfg: CFG,
      myMemId: "me",
    });

    expect(crew.rows.map((r) => r.memNm)).toEqual(["홍길동", "가람", "하늘"]);
    expect(crew.rows[0].isMe).toBe(true);
    expect(crew.rows.filter((r) => r.isMe)).toHaveLength(1);
  });

  it("누적은 열린 회차까지만 잇고, 그 뒤는 null 이다", () => {
    const sessions = makeSessions(4);
    const a = makePrt("a", "가나", ["g1", "g2", "g4"], sessions);
    const crew = buildPbCrewAttd({ sessions, participants: [a], cfg: CFG });

    expect(crew.rows[0].cum.slice(0, 6)).toEqual([1, 2, 2, 3, null, null]);
    expect(crew.rows[0].cum[12]).toBeNull();
  });

  it("합류 전 회차는 null — 결석(0)으로 그리지 않는다", () => {
    const sessions = makeSessions(4);
    const mid = makePrt("b", "다라", ["g3"], sessions, { joinWkNo: 3 });
    const crew = buildPbCrewAttd({ sessions, participants: [mid], cfg: CFG });
    const row = crew.rows[0];

    expect(row.cells.slice(0, 4)).toEqual(["before_join", "before_join", "attended", "missed"]);
    expect(row.cum.slice(0, 4)).toEqual([null, null, 1, 1]);
    expect(row.required).toBe(7); // 3주차 합류 = 남은 11회 × 9/13 내림
  });

  it("취소된 회차는 누적을 떨어뜨리지 않고 직전 값을 잇는다", () => {
    const sessions = makeSessions(4, { canceled: [3] });
    const a = makePrt("a", "가나", ["g1", "g2", "g4"], sessions);
    const crew = buildPbCrewAttd({ sessions, participants: [a], cfg: CFG });

    expect(crew.rows[0].cells[2]).toBe("canceled");
    expect(crew.rows[0].cum.slice(0, 4)).toEqual([1, 2, 2, 3]);
  });

  it("출석 수는 서버 요약(summary)과 같고, 그 값이 마지막 누적과 맞는다", () => {
    const sessions = makeSessions(5, { canceled: [2] });
    const a = makePrt("a", "가나", ["g1", "g3", "g5"], sessions);
    const crew = buildPbCrewAttd({ sessions, participants: [a], cfg: CFG });
    const row = crew.rows[0];

    expect(row.attdCnt).toBe(a.summary.attdCnt);
    expect(row.cum[crew.lastHeldIdx]).toBe(row.attdCnt);
  });

  it("늦은 합류는 기준이 없어 전액 확보로 세지 않는다", () => {
    const sessions = makeSessions(8);
    const late = makePrt("l", "늦둥", ["g6", "g7", "g8"], sessions, { joinWkNo: 6 });
    const full = makePrt("f", "개근", ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8"], sessions);
    const crew = buildPbCrewAttd({ sessions, participants: [late, full], cfg: CFG });

    const lateRow = crew.rows.find((r) => r.memId === "l")!;
    expect(lateRow.late).toBe(true);
    expect(lateRow.required).toBeNull();
    expect(lateRow.full).toBe(false);
    expect(crew.rows.find((r) => r.memId === "f")!.full).toBe(false); // 8회 < 9회
  });

  it("전액 기준을 채운 사람만 fullCnt 에 들어간다", () => {
    const sessions = makeSessions(10);
    const nine = ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9"];
    const crew = buildPbCrewAttd({
      sessions,
      participants: [
        makePrt("a", "가", nine, sessions),
        makePrt("b", "나", ["g1"], sessions),
        makePrt("c", "다", ["g3", "g4", "g5", "g6", "g7", "g8", "g9"], sessions, { joinWkNo: 3 }), // 기준 7
      ],
      cfg: CFG,
    });

    expect(crew.fullCnt).toBe(2);
  });
});

describe("buildPbCrewAttd — 크루 평균", () => {
  it("그 회차에 합류해 있던 사람끼리 평균을 낸다(합류 전 사람을 0으로 끼우지 않는다)", () => {
    const sessions = makeSessions(4);
    const a = makePrt("a", "가나", ["g1", "g2", "g3", "g4"], sessions);
    const b = makePrt("b", "다라", ["g3"], sessions, { joinWkNo: 3 });
    const crew = buildPbCrewAttd({ sessions, participants: [a, b], cfg: CFG });

    expect(crew.avg[0]).toBe(1); // a 혼자
    expect(crew.avg[2]).toBe(2); // (3 + 1) / 2
    expect(crew.avg[3]).toBe(2.5); // (4 + 1) / 2
    expect(crew.avg[4]).toBeNull();
  });

  it("평균은 소수 첫째 자리로 자른다", () => {
    const sessions = makeSessions(1);
    const crew = buildPbCrewAttd({
      sessions,
      participants: [
        makePrt("a", "가", ["g1"], sessions),
        makePrt("b", "나", [], sessions),
        makePrt("c", "다", [], sessions),
      ],
      cfg: CFG,
    });
    expect(crew.avg[0]).toBe(0.3);
  });
});

describe("buildPbCrewAttd — 아직 아무것도 안 열림", () => {
  it("열린 회차가 없으면 heldCnt 0, 누적·평균이 전부 null", () => {
    const sessions = makeSessions(0);
    const crew = buildPbCrewAttd({ sessions, participants: [makePrt("a", "가", [], sessions)], cfg: CFG });

    expect(crew.heldCnt).toBe(0);
    expect(crew.lastHeldIdx).toBe(-1);
    expect(crew.rows[0].cum.every((v) => v === null)).toBe(true);
    expect(crew.avg.every((v) => v === null)).toBe(true);
  });
});

describe("toPbCrewChartData", () => {
  it("나는 me 시리즈로, 다른 사람은 s0… 키로 싣는다(mem_id 를 키로 쓰지 않는다)", () => {
    const sessions = makeSessions(2);
    const crew = buildPbCrewAttd({
      sessions,
      participants: [
        makePrt("me", "홍길동", ["g1", "g2"], sessions),
        makePrt("a", "가람", ["g1"], sessions),
        makePrt("b", "나래", [], sessions),
      ],
      cfg: CFG,
      myMemId: "me",
    });
    const data = toPbCrewChartData(crew);

    expect(data.seriesKeys).toEqual(["s0", "s1"]);
    expect(data.points[1]).toMatchObject({ tick: "2", me: 2, avg: 1, s0: 1, s1: 0 });
    expect(JSON.stringify(data.points)).not.toContain('"me":"'); // me 는 값이지 id 가 아니다
    expect(Object.keys(data.points[0])).not.toContain("a");
    expect(data.myRequired).toBe(9);
    expect(data.meNow).toBe(2);
    expect(data.avgNow).toBe(1);
    expect(data.yMax).toBe(13);
  });

  it("늦은 합류인 나에겐 기준선이 없다", () => {
    const sessions = makeSessions(7);
    const crew = buildPbCrewAttd({
      sessions,
      participants: [makePrt("me", "홍길동", ["g6"], sessions, { joinWkNo: 6 })],
      cfg: CFG,
      myMemId: "me",
    });
    expect(toPbCrewChartData(crew).myRequired).toBeNull();
  });

  it("내 행이 없으면(관찰자) me 시리즈가 비고 기준선도 없다", () => {
    const sessions = makeSessions(2);
    const crew = buildPbCrewAttd({ sessions, participants: [makePrt("a", "가", ["g1"], sessions)], cfg: CFG });
    const data = toPbCrewChartData(crew);

    expect(data.points.every((p) => p.me === null)).toBe(true);
    expect(data.myRequired).toBeNull();
    expect(data.seriesKeys).toEqual(["s0"]);
  });
});

describe("표시 헬퍼", () => {
  it("세로축 눈금은 3회 간격", () => {
    expect(crewYTicks(13)).toEqual([0, 3, 6, 9, 12]);
  });

  it("정수는 소수점 없이, 아니면 한 자리", () => {
    expect(formatCnt(4)).toBe("4");
    expect(formatCnt(4.25)).toBe("4.3");
    expect(formatCnt(0.3)).toBe("0.3");
  });
});

describe("crewGlance — 마지막 열린 회차 한 줄", () => {
  it("마지막으로 열린 회차의 인원·분모·전액 확보 수를 낸다(취소 회차는 건너뛴다)", () => {
    const sessions = makeSessions(5, { canceled: [5] });
    const crew = buildPbCrewAttd({
      sessions,
      participants: [
        makePrt("a", "가", ["g1", "g4"], sessions),
        makePrt("b", "나", ["g1"], sessions),
        makePrt("c", "다", ["g4"], sessions, { joinWkNo: 3 }),
      ],
      cfg: CFG,
    });
    expect(crewGlance(crew)).toEqual({ label: "4주차", attdCnt: 2, eligibleCnt: 3, all: false, fullCnt: 0 });
  });

  it("전원이 나왔으면 all", () => {
    const sessions = makeSessions(1);
    const crew = buildPbCrewAttd({
      sessions,
      participants: [makePrt("a", "가", ["g1"], sessions), makePrt("b", "나", ["g1"], sessions)],
      cfg: CFG,
    });
    expect(crewGlance(crew)?.all).toBe(true);
  });

  it("열린 회차가 없으면 null", () => {
    const sessions = makeSessions(0);
    expect(crewGlance(buildPbCrewAttd({ sessions, participants: [], cfg: CFG }))).toBeNull();
  });
});
