/**
 * PB 클래스 게임팀 점수 — 이슈 #577 보강 2·3번 규칙을 경계값으로 못박는다.
 */
import { describe, expect, it } from "vitest";

import {
  PB_DEFAULT_RULE as RULE,
  canEditGoal,
  computeScoreboard,
  formatSec,
  improvementPts,
  midImprovedRatio,
  parseTimeInput,
  ruleFromJson,
  type PbScoreGathering,
  type PbScoreInput,
  type PbScoreMember,
} from "@/lib/pb-class-score";

const mem = (over: Partial<PbScoreMember> & { prtId: string }): PbScoreMember => ({
  memId: over.prtId,
  memNm: over.prtId,
  joinWkNo: 1,
  late: false,
  grpId: "A",
  goalSec: null,
  recs: {},
  ...over,
});

const training = (wk: number, attendees: string[]): PbScoreGathering => ({
  gthrId: `t${wk}`,
  wkNo: wk,
  crtBy: "admin",
  attendeeMemIds: attendees,
  linked: "TRAINING",
});

const input = (over: Partial<PbScoreInput>): PbScoreInput => ({
  members: [],
  gatherings: [],
  groups: [
    { grpId: "A", grpNm: "A팀", colorNo: 1 },
    { grpId: "B", grpNm: "B팀", colorNo: 2 },
  ],
  missions: [],
  rule: RULE,
  measureWkNo: 13,
  ...over,
});

describe("parseTimeInput / formatSec", () => {
  it.each([
    ["45:30", 2730],
    ["1:02:03", 3723],
    [" 59:59 ", 3599],
    // 폰 숫자 키패드엔 ":"가 없다 — 숫자만이면 시계 표기로 읽는다(2530초가 아니라 25:30)
    ["2530", 1530],
    ["530", 330],
    ["10203", 3723],
  ])("%s → %i초", (raw, sec) => {
    expect(parseTimeInput(raw)).toBe(sec);
  });

  it.each(["", "abc", "45:60", "1:60:00", "0:00", "1:2:3:4", "55", "2575", "16000", "1234567"])("%s → null", (raw) => {
    expect(parseTimeInput(raw)).toBeNull();
  });

  it("초 → 표기", () => {
    expect(formatSec(2730)).toBe("45:30");
    expect(formatSec(3723)).toBe("1:02:03");
    expect(formatSec(null)).toBe("--:--");
  });
});

describe("improvementPts — 1% 단축마다 3점, 상한", () => {
  it("5% 단축 = 15점, 상한 15", () => {
    expect(improvementPts(1500, 1425, 3, 15)).toBe(15);
    expect(improvementPts(1500, 1350, 3, 15)).toBe(15); // 10%여도 상한
  });

  it("1% 미만·느려짐·같음은 0", () => {
    expect(improvementPts(1500, 1490, 3, 15)).toBe(0);
    expect(improvementPts(1500, 1500, 3, 15)).toBe(0);
    expect(improvementPts(1500, 1600, 3, 15)).toBe(0);
  });
});

describe("ruleFromJson", () => {
  it("빠진 값·잘못된 값은 기본값", () => {
    const r = ruleFromJson({ pt: { attend: 12, join: "x" }, goalMaxSec: -1 });
    expect(r.pt.attend).toBe(12);
    expect(r.pt.join).toBe(RULE.pt.join);
    expect(r.goalMaxSec).toBe(RULE.goalMaxSec);
    expect(ruleFromJson(null)).toEqual(RULE);
  });
});

describe("개인 점수", () => {
  it("공식훈련 출석 10 · 일정 참여 3 · 개설 5(본인 포함 3명 이상)", () => {
    const g: PbScoreGathering[] = [
      training(1, ["a"]),
      { gthrId: "x1", wkNo: 1, crtBy: "a", attendeeMemIds: ["a", "z1", "z2"], linked: null },
      { gthrId: "x2", wkNo: 2, crtBy: "a", attendeeMemIds: ["a", "z1"], linked: null }, // 2명 — 개설 점수 없음
    ];
    const s = computeScoreboard(input({ members: [mem({ prtId: "a" })], gatherings: g }));
    const a = s.members[0];
    expect(a.byCd).toMatchObject({ ATTEND: 10, JOIN: 6, HOST: 5 });
    expect(a.total).toBe(21);
  });

  it("혼자 연 벙에 혼자 참석 — 참여·개설 점수 없음 / 개설자가 안 나온 벙 — 개설 점수 없음", () => {
    const g: PbScoreGathering[] = [
      { gthrId: "solo", wkNo: 1, crtBy: "a", attendeeMemIds: ["a"], linked: null },
      { gthrId: "away", wkNo: 1, crtBy: "a", attendeeMemIds: ["z1", "z2", "z3"], linked: null },
    ];
    const s = computeScoreboard(input({ members: [mem({ prtId: "a" })], gatherings: g }));
    expect(s.members[0].byCd).toMatchObject({ JOIN: 0, HOST: 0 });
  });

  it("공식훈련·측정 벙은 개설 점수 대상이 아니다", () => {
    const g: PbScoreGathering[] = [{ ...training(1, ["a", "b", "c"]), crtBy: "a" }];
    const s = computeScoreboard(input({ members: [mem({ prtId: "a" })], gatherings: g }));
    expect(s.members[0].byCd.HOST).toBe(0);
  });

  it("합류 전 주차의 참석은 세지 않는다", () => {
    const g = [training(1, ["a"]), training(3, ["a"])];
    const s = computeScoreboard(input({ members: [mem({ prtId: "a", joinWkNo: 3 })], gatherings: g }));
    expect(s.members[0].byCd.ATTEND).toBe(10);
  });

  it("늦은 합류자·팀 미배정자는 점수 0, 팀전 밖", () => {
    const g = [training(7, ["a", "b"])];
    const s = computeScoreboard(
      input({
        members: [mem({ prtId: "a", joinWkNo: 7, late: true }), mem({ prtId: "b", grpId: null })],
        gatherings: g,
      }),
    );
    expect(s.members.map((m) => [m.inGame, m.total])).toEqual([
      [false, 0],
      [false, 0],
    ]);
  });

  it("기록: 정식 참가자 중간 향상 + 최종 향상(5K×2.085 대비) + 목표 달성", () => {
    const a = mem({
      prtId: "a",
      goalSec: 3000,
      recs: {
        BASE_5K: { sec: 1500, cnfm: true }, // 25:00 → 10K 환산 3127.5초
        MID_5K: { sec: 1440, cnfm: true }, // 4% 단축 → 12점
        FINAL_10K: { sec: 2900, cnfm: true }, // 3127.5 대비 7.27% → 21점
      },
    });
    const s = computeScoreboard(input({ members: [a] }));
    expect(s.members[0].byCd).toMatchObject({ IMPROVE_MID: 12, IMPROVE_FINAL: 21, GOAL: 20 });
    expect(s.members[0].entries.find((e) => e.ptCd === "IMPROVE_MID")?.wkNo).toBe(6);
    expect(s.members[0].entries.find((e) => e.ptCd === "GOAL")?.wkNo).toBe(13);
    expect(s.members[0].goalAchieved).toBe(true);
  });

  it("W2~W5 합류자는 W6 5K가 기준 — 중간 향상 없음, 최종은 W6 대비", () => {
    const b = mem({
      prtId: "b",
      joinWkNo: 3,
      recs: { MID_5K: { sec: 1500, cnfm: true }, FINAL_10K: { sec: 2900, cnfm: true } },
    });
    const s = computeScoreboard(input({ members: [b] }));
    expect(s.members[0].byCd.IMPROVE_MID).toBe(0);
    expect(s.members[0].byCd.IMPROVE_FINAL).toBe(21);
  });

  it("확인 안 된 기록·측정 미연결이면 기록 점수 없음", () => {
    const recs = { BASE_5K: { sec: 1500, cnfm: true }, FINAL_10K: { sec: 2900, cnfm: false } };
    expect(computeScoreboard(input({ members: [mem({ prtId: "a", goalSec: 3000, recs })] })).members[0].total).toBe(0);
    const recs2 = { BASE_5K: { sec: 1500, cnfm: true }, FINAL_10K: { sec: 2900, cnfm: true } };
    expect(
      computeScoreboard(input({ members: [mem({ prtId: "a", recs: recs2 })], measureWkNo: null })).members[0].total,
    ).toBe(0);
  });
});

describe("팀 점수 — 주차별 평균의 합 + 전원 출석 + 미션", () => {
  it("인원이 달라도 평균이라 같은 비율이면 같은 점수", () => {
    const members = [
      mem({ prtId: "a1", grpId: "A" }),
      mem({ prtId: "a2", grpId: "A" }),
      mem({ prtId: "b1", grpId: "B" }),
    ];
    const s = computeScoreboard(input({ members, gatherings: [training(1, ["a1", "a2", "b1"])] }));
    const byId = Object.fromEntries(s.groups.map((g) => [g.grpId, g]));
    expect(byId.A.avgSum).toBe(10);
    expect(byId.B.avgSum).toBe(10);
    expect(byId.A.allAttendBonus).toBe(20);
    expect(byId.A.total).toBe(30);
    expect(s.groups.map((g) => g.rank)).toEqual([1, 1]); // 동점 공동 1위
  });

  it("중간 합류자는 합류 전 주의 분모에 없다", () => {
    // A팀: a1(W1) · a2(W3 합류). W1 출석 a1만 → W1 평균은 a1 혼자 기준 10
    const members = [mem({ prtId: "a1" }), mem({ prtId: "a2", joinWkNo: 3 })];
    const s = computeScoreboard(input({ members, gatherings: [training(1, ["a1"])] }));
    const a = s.groups.find((g) => g.grpId === "A")!;
    expect(a.avgSum).toBe(10);
    expect(a.allAttendWeeks).toEqual([1]); // 그 주 등록 팀원(a1) 전원 출석
  });

  it("한 명이라도 빠지면 전원 출석 보너스 없음, 미션은 성공 팀만", () => {
    const members = [mem({ prtId: "a1" }), mem({ prtId: "a2" }), mem({ prtId: "b1", grpId: "B" })];
    const s = computeScoreboard(
      input({
        members,
        gatherings: [training(1, ["a1", "b1"])],
        missions: [{ msnId: "m1", wkNo: 2, msnNm: "단체사진", pt: 10, succGrpIds: ["A"] }],
      }),
    );
    const byId = Object.fromEntries(s.groups.map((g) => [g.grpId, g]));
    expect(byId.A).toMatchObject({ avgSum: 5, allAttendBonus: 0, missionBonus: 10, total: 15 });
    expect(byId.B).toMatchObject({ avgSum: 10, allAttendBonus: 20, missionBonus: 0, total: 30 });
    expect(s.groups[0].grpId).toBe("B");
  });
});

describe("midImprovedRatio — W6 미션 판정 보조", () => {
  it("기준기록이 W1인 팀원만 분모", () => {
    const team = [
      mem({ prtId: "a", recs: { BASE_5K: { sec: 1500, cnfm: true }, MID_5K: { sec: 1450, cnfm: true } } }),
      mem({ prtId: "b", recs: { BASE_5K: { sec: 1500, cnfm: true }, MID_5K: { sec: 1550, cnfm: true } } }),
      mem({ prtId: "c", joinWkNo: 3, recs: { MID_5K: { sec: 1400, cnfm: true } } }),
    ];
    expect(midImprovedRatio(team)).toEqual({ improved: 1, eligible: 2 });
    expect(midImprovedRatio([team[2]])).toBeNull();
  });
});

describe("canEditGoal — 늦게 합류한 사람은 자기 합류 주차까지", () => {
  it("정식 참가자는 W2까지, W4 합류자는 W4까지", () => {
    expect(canEditGoal(2, RULE)).toBe(true);
    expect(canEditGoal(3, RULE)).toBe(false);
    expect(canEditGoal(4, RULE, 4)).toBe(true);
    expect(canEditGoal(5, RULE, 4)).toBe(false);
  });
});
