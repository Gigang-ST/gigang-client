/**
 * PB 클래스 점수판 「Teams」 칸(#621) 계산 — 팀 구성·팀 단위 출석·순위 변동·전원 출석 연속·빨라진 만큼.
 *
 * 지키는 선: 출석은 팀 단위로만 나간다(팀원 행엔 출석 필드가 없다 — 출석표를 걷은 결정 2026-10-08),
 * 순위·점수는 코어 값 그대로, 못한 것(느려짐·0주 연속)은 세지 않는다.
 */
import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG as CFG, summarizeRefund } from "@/lib/pb-class";
import { buildPbCrewAttd, buildPbTeamSeries } from "@/lib/pb-class-chart";
import {
  PB_DEFAULT_RULE as RULE,
  computeScoreboard,
  type PbRecType,
  type PbScoreGathering,
} from "@/lib/pb-class-score";
import { buildPbTeams, orderPbTeamSlides, pickTeamPhotos } from "@/lib/pb-class-teams";
import type { PbParticipant, PbSession } from "@/lib/queries/pb-class";
import type { PbGameParticipant } from "@/lib/queries/pb-class-game";

/** W1~W12 공식훈련 + 13주차 측정. `heldThrough` 주차까지 열렸다 */
function makeSessions(heldThrough: number, canceled: number[] = []): PbSession[] {
  const w1 = dayjs("2026-11-04T19:30:00+09:00");
  return Array.from({ length: 13 }, (_, i) => i + 1).map((wk) => {
    const delYn = canceled.includes(wk);
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

const recs = (r: Partial<Record<PbRecType, number>>) =>
  Object.fromEntries(Object.entries(r).map(([k, sec]) => [k, { sec, cnfm: true }])) as PbGameParticipant["recs"];

type Spec = {
  memId: string;
  memNm: string;
  grpId: string | null;
  attended: number[];
  joinWkNo?: number;
  aprvYn?: boolean;
  goalSec?: number | null;
  recs?: Partial<Record<PbRecType, number>>;
};

function setup(specs: Spec[], opts: { heldThrough: number; canceled?: number[]; myMemId?: string }) {
  const sessions = makeSessions(opts.heldThrough, opts.canceled);
  const gameParticipants: PbGameParticipant[] = specs.map((s) => {
    const joinWkNo = s.joinWkNo ?? 1;
    return {
      prtId: `p-${s.memId}`,
      memId: s.memId,
      memNm: s.memNm,
      joinWkNo,
      late: joinWkNo >= CFG.lateJoinWkNo,
      grpId: s.grpId,
      goalSec: s.goalSec ?? null,
      recs: recs(s.recs ?? {}),
      aprvYn: s.aprvYn ?? true,
      trnGrpCd: null,
      trnGrpFixedCd: null,
      trnGrpAutoCd: null,
      avatarUrl: null,
    };
  });
  const boardParticipants: PbParticipant[] = specs.map((s) => {
    const joinWkNo = s.joinWkNo ?? 1;
    const attended = s.attended.map((wk) => `g${wk}`);
    return {
      prtId: `p-${s.memId}`,
      memId: s.memId,
      memNm: s.memNm,
      avatarUrl: null,
      joinWkNo,
      depositAmt: CFG.depositAmt,
      entryFeeAmt: CFG.entryFeeAmt,
      entryFeeDcAmt: 0,
      aprvYn: s.aprvYn ?? true,
      aprvAt: null,
      summary: summarizeRefund({ joinWkNo, depositAmt: CFG.depositAmt, links: sessions, attendedGthrIds: new Set(attended), cfg: CFG }),
      attendedGthrIds: attended,
    };
  });
  const gatherings: PbScoreGathering[] = sessions
    .filter((s) => s.held)
    .map((s) => ({
      gthrId: s.gthrId,
      wkNo: s.wkNo,
      crtBy: "admin",
      attendeeMemIds: specs.filter((sp) => sp.attended.includes(s.wkNo)).map((sp) => sp.memId),
      linked: s.sessType,
    }));
  const groups = [
    { grpId: "A", grpNm: "번개팀", colorNo: 1 },
    { grpId: "B", grpNm: "파도팀", colorNo: 2 },
  ];
  const scoreboard = computeScoreboard({
    members: gameParticipants.filter((p) => p.aprvYn),
    gatherings,
    groups,
    rule: RULE,
    measureWkNo: 13,
  });
  const myMemId = opts.myMemId ?? specs[0].memId;
  return buildPbTeams({
    participants: gameParticipants,
    scoreboard,
    rule: RULE,
    crew: buildPbCrewAttd({ sessions, participants: boardParticipants, cfg: CFG, myMemId }),
    series: buildPbTeamSeries({ scoreboard, members: gameParticipants, rule: RULE }),
    heldWkNos: sessions.filter((s) => s.held).map((s) => s.wkNo),
    myMemId,
    myGrpId: specs.find((s) => s.memId === myMemId)?.grpId ?? null,
  });
}

describe("buildPbTeams — 팀 구성", () => {
  it("승인된 팀전 대상만 팀에, 늦은 합류·미배정은 「팀 없음」에. 입금 대기자는 어디에도 없다", () => {
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [1] },
        { memId: "a", memNm: "가람", grpId: "A", attended: [1] },
        { memId: "b", memNm: "나래", grpId: "B", attended: [] },
        { memId: "late", memNm: "다온", grpId: null, attended: [], joinWkNo: 7 },
        { memId: "nogrp", memNm: "라온", grpId: null, attended: [] },
        { memId: "wait", memNm: "대기자", grpId: "A", attended: [1], aprvYn: false },
      ],
      { heldThrough: 1 },
    );
    const byGrp = Object.fromEntries(out.teams.map((t) => [t.grpId, t.members.map((m) => m.memId)]));
    // 나를 맨 앞에, 나머지는 이름순
    expect(byGrp.A).toEqual(["me", "a"]);
    expect(byGrp.B).toEqual(["b"]);
    expect(out.noTeam.map((m) => m.memId)).toEqual(["late", "nogrp"]);
    expect(JSON.stringify(out)).not.toContain("대기자");
    expect(out.teams.find((t) => t.grpId === "A")?.isMine).toBe(true);
  });

  it("팀원 행엔 출석 필드가 없다 — 출석은 팀 단위로만", () => {
    const out = setup([{ memId: "me", memNm: "홍길동", grpId: "A", attended: [1] }], { heldThrough: 1 });
    const keys = Object.keys(out.teams[0].members[0]);
    expect(keys.some((k) => /attd|attend|cnt/i.test(k))).toBe(false);
  });

  it("목표는 있으면 싣고, 없으면 null", () => {
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [], goalSec: 2700 },
        { memId: "a", memNm: "가람", grpId: "A", attended: [] },
      ],
      { heldThrough: 1 },
    );
    const m = Object.fromEntries(out.teams[0].members.map((x) => [x.memId, x.goalSec]));
    expect(m).toEqual({ me: 2700, a: null });
  });
});

describe("buildPbTeams — 팀 출석", () => {
  it("최근 회차 n/m명은 그 회차에 합류해 있던 팀원만 분모로 센다", () => {
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [1, 2, 3] },
        { memId: "a", memNm: "가람", grpId: "A", attended: [1] },
        { memId: "c", memNm: "다솜", grpId: "A", attended: [3], joinWkNo: 3 },
      ],
      { heldThrough: 3 },
    );
    const a = out.teams.find((t) => t.grpId === "A")!;
    expect(a.recent).toEqual({ label: "3주차", attdCnt: 2, eligibleCnt: 3 });
    // 1주차엔 다솜이 합류 전이라 2명 중 2명, 2주차엔 2명 중 1명
    expect(a.bars.map((b) => b.rate)).toEqual([1, 0.5, 2 / 3]);
  });

  it("취소된 회차는 막대 대신 취소 표시이고, 전원 출석 연속을 끊지 않는다", () => {
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [1, 3, 4] },
        { memId: "a", memNm: "가람", grpId: "A", attended: [1, 3, 4] },
      ],
      { heldThrough: 4, canceled: [2] },
    );
    const a = out.teams.find((t) => t.grpId === "A")!;
    expect(a.bars[1]).toMatchObject({ canceled: true, rate: null });
    expect(a.allAttendStreak).toBe(3);
  });

  it("최근 회차에 한 명이라도 빠지면 연속은 0 — 그 앞의 연속은 세지 않는다", () => {
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [1, 2, 3] },
        { memId: "a", memNm: "가람", grpId: "A", attended: [1, 2] },
      ],
      { heldThrough: 3 },
    );
    expect(out.teams.find((t) => t.grpId === "A")!.allAttendStreak).toBe(0);
  });

  it("크루 한 줄 — 마지막 회차의 승인 참가자 출석", () => {
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [1] },
        { memId: "a", memNm: "가람", grpId: "B", attended: [] },
      ],
      { heldThrough: 1 },
    );
    expect(out.glance).toMatchObject({ label: "1주차", attdCnt: 1, eligibleCnt: 2, all: false });
  });

  it("열린 회차가 없으면 크루 한 줄·최근 회차·막대가 없다", () => {
    const out = setup([{ memId: "me", memNm: "홍길동", grpId: "A", attended: [] }], { heldThrough: 0 });
    expect(out.glance).toBeNull();
    expect(out.teams[0].recent).toBeNull();
    expect(out.teams[0].bars).toEqual([]);
  });
});

describe("buildPbTeams — 순위·이번 주 점수", () => {
  it("순위는 코어 값, 마지막 주 점수와 직전 주 대비 순위 변동을 낸다", () => {
    // 1주차: A 전원 출석(보너스) → A 1위. 2주차: B만 전원 출석 → B가 뒤집는다
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [1] },
        { memId: "a", memNm: "가람", grpId: "A", attended: [1] },
        { memId: "b", memNm: "나래", grpId: "B", attended: [2] },
        { memId: "c", memNm: "다온", grpId: "B", attended: [1, 2] },
      ],
      { heldThrough: 2 },
    );
    const [first, second] = out.teams;
    expect(first.grpId).toBe("B");
    expect(first.rank).toBe(1);
    expect(first.week).toMatchObject({ wkNo: 2, rankMove: 1 });
    expect(first.week!.gain).toBe(RULE.pt.attend + RULE.pt.allAttend);
    expect(second.week).toMatchObject({ wkNo: 2, gain: 0, rankMove: -1 });
  });
});

describe("buildPbTeams — 빨라진 만큼", () => {
  it("1주차 5K × 계수보다 빨라졌을 때만 ▲, 느려졌거나 새 기록이 없으면 비운다", () => {
    const out = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [], recs: { BASE_5K: 1500, MID_5K: 1440 } },
        { memId: "a", memNm: "가람", grpId: "A", attended: [], recs: { BASE_5K: 1500, MID_5K: 1560 } },
        { memId: "b", memNm: "나래", grpId: "A", attended: [], recs: { BASE_5K: 1500 } },
        { memId: "c", memNm: "다온", grpId: "A", attended: [], recs: { MID_5K: 1400 } },
      ],
      { heldThrough: 1 },
    );
    const m = Object.fromEntries(out.teams[0].members.map((x) => [x.memId, x]));
    expect(m.me.fasterSec).toBe(Math.round(1500 * RULE.tenKFactor) - Math.round(1440 * RULE.tenKFactor));
    expect(m.me.pred10kSec).toBe(Math.round(1440 * RULE.tenKFactor));
    expect(m.a.fasterSec).toBeNull();
    expect(m.b.fasterSec).toBeNull();
    expect(m.b.pred10kSec).toBe(Math.round(1500 * RULE.tenKFactor));
    expect(m.c.fasterSec).toBeNull(); // 1주차 기준기록이 없다
  });

  it("크루 평균은 1주차·새 기록이 둘 다 있는 사람끼리 견준다 — 합이 빨라졌을 때만", () => {
    const base = Math.round(1500 * RULE.tenKFactor);
    const faster = setup(
      [
        { memId: "me", memNm: "홍길동", grpId: "A", attended: [1], recs: { BASE_5K: 1500, FINAL_10K: base - 120 } },
        { memId: "a", memNm: "가람", grpId: "A", attended: [1], recs: { BASE_5K: 1500, FINAL_10K: base + 60 } },
        { memId: "b", memNm: "나래", grpId: "A", attended: [1], recs: { BASE_5K: 1000 } }, // 비교 밖
      ],
      { heldThrough: 1 },
    );
    expect(faster.glance?.fasterSec).toBe(30);

    const slower = setup(
      [{ memId: "me", memNm: "홍길동", grpId: "A", attended: [1], recs: { BASE_5K: 1500, FINAL_10K: base + 10 } }],
      { heldThrough: 1 },
    );
    expect(slower.glance?.fasterSec).toBeNull();
  });
});

describe("pickTeamPhotos", () => {
  it("팀마다 앞에서부터 N장, 팀 밖 사람 글은 버린다", () => {
    const posts = ["a", "b", "x", "a", "a", "b"].map((mem_id, i) => ({ post_id: `p${i}`, mem_id }));
    const out = pickTeamPhotos(posts, new Map([["a", "A"], ["b", "B"]]), 2);
    expect(out.get("A")?.map((p) => p.post_id)).toEqual(["p0", "p3"]);
    expect(out.get("B")?.map((p) => p.post_id)).toEqual(["p1", "p5"]);
    expect([...out.keys()].sort()).toEqual(["A", "B"]);
  });
});

describe("orderPbTeamSlides — Teams 칸 넘김 순서(#624)", () => {
  const t = (grpId: string, rank: number, isMine = false) => ({ grpId, rank, isMine });
  const ids = (s: ReturnType<typeof orderPbTeamSlides<ReturnType<typeof t>>>) =>
    s.map((x) => (x.kind === "team" ? x.team.grpId : "NO_TEAM"));

  it("첫 장은 내 팀 — 나머지는 순위 순서, 팀 없음은 맨 끝", () => {
    expect(ids(orderPbTeamSlides([t("A", 1), t("B", 2), t("C", 3, true)], true))).toEqual(["C", "A", "B", "NO_TEAM"]);
  });

  it("내 팀이 없으면 1위부터", () => {
    expect(ids(orderPbTeamSlides([t("B", 2), t("A", 1), t("C", 3)], true))).toEqual(["A", "B", "C", "NO_TEAM"]);
  });

  it("공동 순위는 받은 순서를 지킨다", () => {
    expect(ids(orderPbTeamSlides([t("A", 1), t("B", 1), t("C", 3)], false))).toEqual(["A", "B", "C"]);
  });

  it("팀 없음이 없으면 묶음 장도 없다 · 팀이 없으면 팀 없음 한 장", () => {
    expect(ids(orderPbTeamSlides([t("A", 1, true)], false))).toEqual(["A"]);
    expect(ids(orderPbTeamSlides([], true))).toEqual(["NO_TEAM"]);
  });
});
