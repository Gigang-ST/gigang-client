/**
 * PB 클래스 「크루 출석」 그래프·출석표 계산 — 빈 칸의 뜻(합류 전·취소·예정)이 0과 섞이지 않는지 못박는다.
 * 금액은 다루지 않는다(환급은 `pb-class.test.ts`). 여기서 지키는 건 「누가 언제 나왔나」를 그리는 모양이다.
 */
import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG as CFG, summarizeRefund } from "@/lib/pb-class";
import {
  buildPbCrewAttd,
  buildPbTeamSeries,
  buildPbTrack,
  crewGlance,
  crewYTicks,
  formatCnt,
  formatTrackTick,
  layoutTrackLanes,
  predicted10k,
  teamWeekGains,
  teamYAxis,
  toPbCrewChartData,
  TRACK_BASE_W,
  TRACK_HIT,
} from "@/lib/pb-class-chart";
import {
  PB_DEFAULT_RULE,
  computeScoreboard,
  type PbRecType,
  type PbScoreGathering,
  type PbScoreMember,
} from "@/lib/pb-class-score";
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

// ─────────────────────────────────────────
// 팀별 점수 그래프
// ─────────────────────────────────────────

const RULE = PB_DEFAULT_RULE;
const round1 = (n: number) => Math.round(n * 10) / 10;

const scoreMem = (over: Partial<PbScoreMember> & { prtId: string }): PbScoreMember => ({
  memId: over.prtId,
  memNm: over.prtId,
  joinWkNo: 1,
  late: false,
  grpId: "A",
  goalSec: null,
  recs: {},
  ...over,
});

const linked = (wk: number, attendees: string[], kind: "TRAINING" | "MEASURE" = "TRAINING"): PbScoreGathering => ({
  gthrId: `t${wk}`,
  wkNo: wk,
  crtBy: "admin",
  attendeeMemIds: attendees,
  linked: kind,
});

const bung = (id: string, wk: number, crtBy: string, attendees: string[]): PbScoreGathering => ({
  gthrId: id,
  wkNo: wk,
  crtBy,
  attendeeMemIds: attendees,
  linked: null,
});

/**
 * A팀: a·b(정식), c(3주차 합류 — 분모가 3주차부터 3명), z(늦은 합류 — 팀전 제외)
 * B팀: d·e(정식). 1·3주차 전원 출석 → 보너스. C팀: 점수 0(아무도 안 나옴)
 */
const MEMBERS: PbScoreMember[] = [
  scoreMem({ prtId: "a", recs: { BASE_5K: { sec: 1500, cnfm: true }, FINAL_10K: { sec: 2900, cnfm: true } }, goalSec: 3000 }),
  scoreMem({ prtId: "b" }),
  scoreMem({ prtId: "c", joinWkNo: 3 }),
  scoreMem({ prtId: "z", joinWkNo: 7, late: true }),
  scoreMem({ prtId: "d", grpId: "B" }),
  scoreMem({ prtId: "e", grpId: "B" }),
  scoreMem({ prtId: "f", grpId: "C" }),
];

const GATHERINGS: PbScoreGathering[] = [
  linked(1, ["a", "b", "d", "e"]),
  bung("x2", 2, "b", ["a", "b", "d"]), // 일정 참여 a·b·d, 개설 b(3명)
  linked(3, ["a", "b", "c", "d", "e"]),
  linked(4, ["c", "d", "z"]),
  linked(13, ["a", "d"], "MEASURE"),
];

const GROUPS = [
  { grpId: "A", grpNm: "A팀", colorNo: 1 },
  { grpId: "B", grpNm: "B팀", colorNo: 2 },
  { grpId: "C", grpNm: "C팀", colorNo: 3 },
];

function scoreboardOf(members = MEMBERS, gatherings = GATHERINGS) {
  return computeScoreboard({ members, gatherings, groups: GROUPS, rule: RULE, measureWkNo: 13 });
}

describe("buildPbTeamSeries — 팀별 누적 점수", () => {
  const sb = scoreboardOf();
  const series = buildPbTeamSeries({ scoreboard: sb, members: MEMBERS, rule: RULE })!;

  it("그래프 마지막 점 = 순위표 total — 팀마다 정확히 같다", () => {
    expect(series).not.toBeNull();
    for (const g of sb.groups) {
      const t = series.teams.find((x) => x.grpId === g.grpId)!;
      expect(t.cum.at(-1)).toBe(g.total);
      expect(t.total).toBe(g.total);
    }
  });

  it("주차별 증분을 다 더하면(반올림 한 번) 코어의 total 과 같다 — 마지막 점을 맞추기 전부터", () => {
    const joinWkByPrt = new Map(MEMBERS.map((m) => [m.prtId, m.joinWkNo]));
    for (const g of sb.groups) {
      const gains = teamWeekGains({ grp: g, scoreboard: sb, joinWkByPrt, rule: RULE, lastWk: series.weeks.length });
      expect(round1(gains.reduce((s, v) => s + v, 0))).toBe(g.total);
    }
  });

  it("가로축은 1주차부터 점수가 난 마지막 주차(측정)까지 빈틈없이", () => {
    expect(series.weeks[0]).toBe(1);
    expect(series.weeks.at(-1)).toBe(13);
    expect(series.weeks).toHaveLength(13);
  });

  it("분모는 그 주에 등록된 팀원 — 합류 전 주엔 c 가 없고, 늦은 합류 z 는 끝까지 없다", () => {
    const a = series.teams.find((t) => t.grpId === "A")!;
    // 1주차: a·b 출석 10+10 / 2명(c 합류 전) = 10 — 그 주 등록된 둘이 다 나와 전원 출석 보너스도 붙는다
    expect(a.gain[0]).toBe(10 + RULE.pt.allAttend);
    // 2주차: 일정 참여 a 3 + b 3 + 개설 b 5 = 11 / 2명 = 5.5
    expect(a.gain[1]).toBe(5.5);
    // 3주차: a·b·c 출석 30 / 3명 = 10 (전원 출석 보너스는 A팀에도 붙는다 — 그 주 등록 셋 다 나왔다)
    expect(a.gain[2]).toBe(10 + RULE.pt.allAttend);
    // 4주차: c 혼자 10 / 3명 = 3.3 — z(늦은 합류)는 나왔어도 분모·분자 어디에도 없다
    expect(a.gain[3]).toBe(3.3);
    // 점수가 없는 주는 그대로 평평하다
    expect(a.cum[4]).toBe(a.cum[3]);
  });

  it("전원 출석 보너스는 그 주에 붙는다", () => {
    const b = series.teams.find((t) => t.grpId === "B")!;
    expect(b.gain[0]).toBe(10 + RULE.pt.allAttend); // 1주차 d·e 모두
    expect(b.gain[3]).toBe(5); // 4주차 d 혼자 10 / 2명 — 전원이 아니라 보너스 없음
  });

  it("누적은 줄지 않고, 순서는 코어가 매긴 순위 그대로다", () => {
    for (const t of series.teams) {
      t.cum.forEach((v, i) => {
        if (i > 0) expect(v).toBeGreaterThanOrEqual(t.cum[i - 1]);
      });
    }
    expect(series.teams.map((t) => t.grpId)).toEqual(sb.groups.map((g) => g.grpId));
    expect(series.teams.at(-1)!.cum.every((v) => v === 0)).toBe(true); // C팀 — 0 에서 평평하게
  });

  it("팀이 없거나 아직 아무 점수도 없으면 null(빈 상태가 선다)", () => {
    const none = computeScoreboard({ members: MEMBERS, gatherings: GATHERINGS, groups: [], rule: RULE, measureWkNo: 13 });
    expect(buildPbTeamSeries({ scoreboard: none, members: MEMBERS, rule: RULE })).toBeNull();

    // 벙도 기록도 없다(기록만으로도 측정 주차 점수가 나므로 기록까지 비운다)
    const bare = MEMBERS.map((m) => ({ ...m, recs: {} }));
    const quiet = scoreboardOf(bare, []);
    expect(buildPbTeamSeries({ scoreboard: quiet, members: bare, rule: RULE })).toBeNull();
  });

  it("3·6·7명이 섞인 평균(무한소수)도 끝이 순위표와 같다", () => {
    const many: PbScoreMember[] = Array.from({ length: 7 }, (_, i) =>
      scoreMem({ prtId: `m${i}`, joinWkNo: i < 3 ? 1 : i < 6 ? 2 : 5 }),
    );
    const gs: PbScoreGathering[] = [
      linked(1, ["m0"]),
      linked(2, ["m0", "m3", "m4"]),
      bung("y3", 3, "m1", ["m1", "m2", "m5"]),
      linked(5, ["m6", "m2"]),
      linked(6, many.map((m) => m.prtId)),
    ];
    const sb7 = computeScoreboard({ members: many, gatherings: gs, groups: GROUPS, rule: RULE, measureWkNo: 13 });
    const s7 = buildPbTeamSeries({ scoreboard: sb7, members: many, rule: RULE })!;
    const joinWkByPrt = new Map(many.map((m) => [m.prtId, m.joinWkNo]));
    const g = sb7.groups.find((x) => x.grpId === "A")!;
    const gains = teamWeekGains({ grp: g, scoreboard: sb7, joinWkByPrt, rule: RULE, lastWk: s7.weeks.length });
    expect(round1(gains.reduce((s, v) => s + v, 0))).toBe(g.total);
    expect(s7.teams.find((t) => t.grpId === "A")!.cum.at(-1)).toBe(g.total);
  });

  it("세로축 끝은 1위 위로 여유를 두고, 눈금은 정수 간격으로 다섯 칸 이하", () => {
    const { max, ticks } = teamYAxis(series);
    expect(max).toBeGreaterThan(Math.max(...sb.groups.map((g) => g.total)));
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(max);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.every(Number.isInteger)).toBe(true);
    // 50점 남짓이면 12.5 같은 눈금이 아니라 10·20 또는 20·40 …
    const small = { ...series, teams: [{ ...series.teams[0], total: 46 }] };
    expect(teamYAxis(small).ticks.every(Number.isInteger)).toBe(true);
  });
});

// ─────────────────────────────────────────
// 10K 예상기록 트랙
// ─────────────────────────────────────────

const recs = (r: Partial<Record<PbRecType, number>>, cnfm = true) =>
  Object.fromEntries(Object.entries(r).map(([k, sec]) => [k, { sec, cnfm }])) as PbScoreMember["recs"];

describe("predicted10k — 측정 10K 가 있으면 그것, 없으면 최근 5K × 계수", () => {
  it("측정 10K 실제 기록이 1순위다", () => {
    expect(predicted10k({ recs: recs({ FINAL_10K: 2890, MID_5K: 1300, BASE_5K: 1400 }) }, RULE)).toEqual({
      sec: 2890,
      basis: "10K 측정 기록",
      src: "FINAL_10K",
    });
  });

  it("없으면 중간점검 5K(가장 최근) × 2.085 — 주차는 설정값에서", () => {
    const p = predicted10k({ recs: recs({ MID_5K: 1300, BASE_5K: 1400 }) }, RULE)!;
    expect(p.sec).toBe(Math.round(1300 * 2.085));
    expect(p.basis).toBe("6주차 5K × 2.085");
    expect(predicted10k({ recs: recs({ MID_5K: 1300 }) }, { ...RULE, midWkNo: 7 })!.basis).toBe("7주차 5K × 2.085");
  });

  it("1주차 5K 만 있으면 그것 × 2.085", () => {
    const p = predicted10k({ recs: recs({ BASE_5K: 1500 }) }, RULE)!;
    expect(p).toEqual({ sec: Math.round(1500 * 2.085), basis: "1주차 5K × 2.085", src: "BASE_5K" });
  });

  it("대구 10K 만 있거나 아무것도 없으면 null — 확정 여부(cnfm)는 보지 않는다", () => {
    expect(predicted10k({ recs: recs({ DAEGU_10K: 2800 }) }, RULE)).toBeNull();
    expect(predicted10k({ recs: {} }, RULE)).toBeNull();
    expect(predicted10k({ recs: recs({ BASE_5K: 1500 }, false) }, RULE)?.sec).toBe(Math.round(1500 * 2.085));
  });
});

describe("layoutTrackLanes — 겹치면 레인을 나눈다", () => {
  const gap = 10;

  it("충분히 떨어져 있으면 모두 한 레인", () => {
    const { laneOf, laneCnt } = layoutTrackLanes(
      [{ id: "a", x: 10 }, { id: "b", x: 30 }, { id: "c", x: 55 }],
      { minGap: gap, maxLanes: 8 },
    );
    expect(laneCnt).toBe(1);
    expect([...laneOf.values()]).toEqual([0, 0, 0]);
  });

  it("같은 자리에 셋이면 세 레인으로 쌓는다", () => {
    const { laneOf, laneCnt } = layoutTrackLanes(
      [{ id: "a", x: 50 }, { id: "b", x: 52 }, { id: "c", x: 55 }],
      { minGap: gap, maxLanes: 8 },
    );
    expect(laneCnt).toBe(3);
    expect(new Set(laneOf.values())).toEqual(new Set([0, 1, 2]));
  });

  it("나는 맨 윗레인(0) — 옆사람이 아래로 비켜선다", () => {
    const { laneOf } = layoutTrackLanes(
      [{ id: "a", x: 40 }, { id: "me", x: 44, pin: true }, { id: "b", x: 80 }],
      { minGap: gap, maxLanes: 8 },
    );
    expect(laneOf.get("me")).toBe(0);
    expect(laneOf.get("a")).toBe(1);
    expect(laneOf.get("b")).toBe(0);
  });

  it("레인 상한을 넘기지 않고, 넘치면 덜 겹치는 레인에 끼운다(내 레인은 피한다)", () => {
    const items = [
      { id: "me", x: 50, pin: true },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, x: 50 + i })),
    ];
    const { laneOf, laneCnt } = layoutTrackLanes(items, { minGap: gap, maxLanes: 3 });
    expect(laneCnt).toBe(3);
    for (const [id, lane] of laneOf) {
      expect(lane).toBeLessThan(3);
      if (id !== "me") expect(lane).not.toBe(0);
    }
  });

  it("입력 순서가 달라도 같은 배치(서버·클라이언트가 같은 그림)", () => {
    const items = [
      { id: "a", x: 50 },
      { id: "b", x: 51 },
      { id: "c", x: 20 },
      { id: "d", x: 52 },
    ];
    const one = layoutTrackLanes(items, { minGap: gap, maxLanes: 8 });
    const two = layoutTrackLanes([...items].reverse(), { minGap: gap, maxLanes: 8 });
    expect([...two.laneOf.entries()].sort()).toEqual([...one.laneOf.entries()].sort());
  });
});

type TrackPrt = Parameters<typeof buildPbTrack>[0]["participants"][number];
const tp = (memId: string, r: Partial<Record<PbRecType, number>>, over: Partial<TrackPrt> = {}): TrackPrt => ({
  memId,
  memNm: memId,
  grpId: null,
  goalSec: null,
  recs: recs(r),
  aprvYn: true,
  avatarUrl: null,
  ...over,
});

describe("buildPbTrack — 왼쪽 느림 · 오른쪽 빠름", () => {
  const prts: TrackPrt[] = [
    tp("me", { BASE_5K: 1380 }, { goalSec: 2700, grpId: "A" }), // 47:57
    tp("fast", { FINAL_10K: 2340 }, { grpId: "B" }), // 39:00
    tp("slow", { MID_5K: 1700 }), // 59:05
    tp("mid", { BASE_5K: 1320 }), // 45:52
    tp("none", {}),
    tp("pending", { BASE_5K: 1200 }, { aprvYn: false }),
  ];
  const track = buildPbTrack({
    participants: prts,
    rule: RULE,
    myMemId: "me",
    colorOfGrp: new Map([["A", 1], ["B", 2]]),
  })!;
  const by = (id: string) => track.runners.find((r) => r.memId === id)!;

  it("느린 사람이 왼쪽, 빠른 사람이 오른쪽에 선다", () => {
    expect(by("slow").x).toBeLessThan(by("me").x);
    expect(by("me").x).toBeLessThan(by("mid").x);
    expect(by("mid").x).toBeLessThan(by("fast").x);
    for (const r of track.runners) {
      expect(r.x).toBeGreaterThan(0);
      expect(r.x).toBeLessThan(100);
    }
  });

  it("입금 대기자는 트랙에도 「못 선 사람」에도 없다 — 기록 없는 승인자만 센다", () => {
    expect(track.runners.map((r) => r.memId)).not.toContain("pending");
    expect(track.missingCnt).toBe(1);
    expect(track.meMissing).toBe(false);
  });

  it("범위는 양 끝 사람에서 1분 이상 벌린 분 단위, 눈금은 5분 배수로 왼쪽(큰 숫자)부터", () => {
    expect(track.slowSec % 60).toBe(0);
    expect(track.fastSec % 60).toBe(0);
    expect(track.slowSec - by("slow").sec).toBeGreaterThanOrEqual(60);
    expect(by("fast").sec - track.fastSec).toBeGreaterThanOrEqual(60);
    // 5분 단위로 끊지 않는다 — 빈 구간이 트랙을 먹지 않게(가장 빠른 39:00 → 35:00 이 아니라 37~38분)
    expect(by("fast").sec - track.fastSec).toBeLessThan(180);
    const secs = track.ticks.map((t) => t.sec);
    expect(secs).toEqual([...secs].sort((a, b) => b - a));
    expect(secs.every((s) => s % 300 === 0 && s >= track.fastSec && s <= track.slowSec)).toBe(true);
    expect(track.ticks[0].x).toBeLessThan(track.ticks.at(-1)!.x);
  });

  it("근거·유니폼 색·내 목표선·중앙값", () => {
    expect(by("fast").basis).toBe("10K 측정 기록");
    expect(by("slow").basis).toBe("6주차 5K × 2.085");
    expect(by("me").colorNo).toBe(1);
    expect(by("slow").colorNo).toBeNull();
    expect(track.goal).toEqual({ sec: 2700, x: expect.any(Number) });
    // 4명의 중앙값 = 가운데 둘(45:52·47:57)의 평균
    expect(track.median.sec).toBe(Math.round((Math.round(1320 * 2.085) + Math.round(1380 * 2.085)) / 2));
  });

  it("나는 맨 윗레인에 서고, 그리는 순서의 맨 뒤(포개져도 위)다", () => {
    expect(by("me").lane).toBe(0);
    expect(track.runners.at(-1)!.memId).toBe("me");
  });

  it("360px 에서 32px 히트 영역이 안 겹친다 — 같은 레인 이웃은 그 간격 이상", () => {
    // 5K 10초 간격 12명 — 트랙에선 5.6% 남짓 간격이라 한 레인에 셋째마다 선다(12명이 12레인이 아니다)
    const crowd = Array.from({ length: 12 }, (_, i) => tp(`r${i}`, { BASE_5K: 1300 + i * 10 }));
    const t = buildPbTrack({ participants: crowd, rule: RULE, myMemId: null })!;
    const minGap = (TRACK_HIT / TRACK_BASE_W) * 100;
    expect(t.laneCnt).toBe(3);
    for (let lane = 0; lane < t.laneCnt; lane++) {
      const xs = t.runners.filter((r) => r.lane === lane).map((r) => r.x).sort((a, b) => a - b);
      xs.forEach((x, i) => i > 0 && expect(x - xs[i - 1]).toBeGreaterThanOrEqual(minGap));
    }

    // 한 자리에 40명이 몰려도 8레인을 넘지 않는다(트랙이 끝없이 높아지지 않게)
    const jam = Array.from({ length: 40 }, (_, i) => tp(`j${i}`, { BASE_5K: 1400 }));
    expect(buildPbTrack({ participants: jam, rule: RULE, myMemId: null })!.laneCnt).toBe(8);
  });

  it("내 기록이 없으면 meMissing, 아무도 없으면 null", () => {
    const t = buildPbTrack({ participants: [tp("me", {}), tp("a", { BASE_5K: 1400 })], rule: RULE, myMemId: "me" })!;
    expect(t.meMissing).toBe(true);
    expect(t.missingCnt).toBe(1);
    expect(t.runners.map((r) => r.memId)).toEqual(["a"]);
    expect(buildPbTrack({ participants: [tp("me", {})], rule: RULE, myMemId: "me" })).toBeNull();
  });

  it("축 눈금 표기는 분:00 — 1시간이 넘어도 짧게", () => {
    expect(formatTrackTick(3600)).toBe("60:00");
    expect(formatTrackTick(2700)).toBe("45:00");
  });
});
