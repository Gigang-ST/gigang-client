import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG, summarizeRefund } from "@/lib/pb-class";
import {
  PB_DEFAULT_RULE,
  type PbGroupScore,
  type PbMemberScore,
  type PbScoreboard as PbScoreboardData,
} from "@/lib/pb-class-score";
import type { PbClassBoard, PbParticipant, PbSession } from "@/lib/queries/pb-class";

import { PbGoalCard } from "@/components/projects/pb-class/pb-goal-card";
import { PbMyTeam } from "@/components/projects/pb-class/pb-my-team";
import { PbRecordsCard } from "@/components/projects/pb-class/pb-records-card";
import { PbScoreboard } from "@/components/projects/pb-class/pb-scoreboard";
import { PbSettlement } from "@/components/projects/pb-class/pb-settlement";
import { teamColorClass } from "@/components/projects/pb-class/pb-team-color";

// 클라이언트 카드가 부르는 라우터·서버 액션은 이 테스트가 보는 대상이 아니다.
// 서버 액션 모듈은 인증·next/cache 를 끌고 들어와 node 환경에서 로드조차 안 되므로 통째로 막는다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/actions/pb-class", () => ({
  setMyPbGoal: vi.fn(),
  setMyDaeguRecord: vi.fn(),
}));

/**
 * PB 클래스 2·3단계 회원 화면이 **규칙을 마크업에 실제로 말하는지** 못박는다.
 *
 * 점수 계산은 `lib/__tests__/pb-class-score.test.ts`가 지킨다. 여기서 보는 건 그 결과가
 * 화면에서 어떻게 읽히느냐 — 순위 순서·내 팀 강조·늦은 합류자의 안내·합류 시점별 기록 줄.
 * 전부 틀려도 크래시가 안 나는 종류라 눈으로만 알게 되는 회귀다.
 */

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

// ─────────────────────────────────────────
// 점수판
// ─────────────────────────────────────────

function group(over: Partial<PbGroupScore> & Pick<PbGroupScore, "grpId" | "grpNm" | "rank" | "total">): PbGroupScore {
  return {
    colorNo: 1,
    memberCnt: 5,
    avgSum: over.total,
    allAttendWeeks: [],
    allAttendBonus: 0,
    missionBonus: 0,
    ...over,
  };
}

function memberScore(over: Partial<PbMemberScore> = {}): PbMemberScore {
  return {
    prtId: "p1",
    memId: "m1",
    memNm: "홍길동",
    grpId: "g1",
    inGame: true,
    total: 0,
    byCd: { ATTEND: 0, JOIN: 0, HOST: 0, IMPROVE_MID: 0, IMPROVE_FINAL: 0, GOAL: 0 },
    entries: [],
    goalAchieved: false,
    ...over,
  };
}

/** 코어가 정렬·순위까지 매겨 준 상태 — 1위가 앞에 선다 */
const BOARD: PbScoreboardData = {
  members: [memberScore()],
  groups: [
    group({ grpId: "g2", grpNm: "번개팀", colorNo: 2, rank: 1, total: 132.5, avgSum: 82.5, allAttendBonus: 40, missionBonus: 10 }),
    group({ grpId: "g1", grpNm: "불꽃팀", colorNo: 1, rank: 2, total: 90, avgSum: 70, allAttendBonus: 20, missionBonus: 0 }),
    group({ grpId: "g3", grpNm: "바람팀", colorNo: null, rank: 3, total: 40 }),
  ],
};

describe("PbScoreboard", () => {
  it("코어가 준 순서 그대로 순위·이름·점수를 그린다", () => {
    const out = html(
      createElement(PbScoreboard, { scoreboard: BOARD, rule: PB_DEFAULT_RULE, myGrpId: null, me: null }),
    );

    expect(out.indexOf("번개팀")).toBeLessThan(out.indexOf("불꽃팀"));
    expect(out.indexOf("불꽃팀")).toBeLessThan(out.indexOf("바람팀"));
    expect(out).toContain("132.5"); // 소수 한 자리는 그대로
    expect(out).toContain("90"); // 정수는 .0 을 달지 않는다
    expect(out).not.toContain("90.0");
    expect(out.match(/<li>/g)).toHaveLength(3);
  });

  it("점수 근거 한 줄에 평균·전원출석·미션이 따로 나온다", () => {
    const out = html(
      createElement(PbScoreboard, { scoreboard: BOARD, rule: PB_DEFAULT_RULE, myGrpId: null, me: null }),
    );

    expect(out).toContain("평균 82.5 · 전원출석 +40 · 미션 +10");
  });

  it("내 팀만 테두리로 짚고 배지를 단다", () => {
    const out = html(
      createElement(PbScoreboard, { scoreboard: BOARD, rule: PB_DEFAULT_RULE, myGrpId: "g1", me: null }),
    );

    expect(out.match(/data-mine="true"/g)).toHaveLength(1);
    expect(out.match(/border-primary/g)).toHaveLength(1);
    expect(out.match(/내 팀/g)).toHaveLength(1);
    // 하이라이트가 2위 카드에 붙었는지(1위 카드가 아니라)
    expect(out.indexOf('data-mine="true"')).toBeGreaterThan(out.indexOf("번개팀"));
    expect(out.indexOf('data-mine="true"')).toBeLessThan(out.indexOf("불꽃팀"));
  });

  it("팀이 아직 없으면 발표 전 안내만 서고 내 점수는 그리지 않는다", () => {
    const out = html(
      createElement(PbScoreboard, {
        scoreboard: { members: [], groups: [] },
        rule: PB_DEFAULT_RULE,
        myGrpId: null,
        me: { memId: "m1", late: false },
      }),
    );

    expect(out).toContain("팀 발표 전이에요");
    expect(out).not.toContain("MY SCORE");
  });

  it("구경하는 사람(me 없음)에겐 내 점수 블록이 없다", () => {
    const out = html(
      createElement(PbScoreboard, { scoreboard: BOARD, rule: PB_DEFAULT_RULE, myGrpId: null, me: null }),
    );

    expect(out).not.toContain("MY SCORE");
  });

  it("내 점수는 0이 아닌 항목만 풀어 보여 준다", () => {
    const mine = memberScore({
      total: 36,
      byCd: { ATTEND: 30, JOIN: 6, HOST: 0, IMPROVE_MID: 0, IMPROVE_FINAL: 0, GOAL: 0 },
    });
    const out = html(
      createElement(PbScoreboard, {
        scoreboard: { ...BOARD, members: [mine] },
        rule: PB_DEFAULT_RULE,
        myGrpId: "g1",
        me: { memId: "m1", late: false },
      }),
    );

    expect(out).toContain("MY SCORE");
    expect(out).toContain("36점");
    expect(out).toContain("공식훈련 출석");
    expect(out).toContain("+30점");
    expect(out).toContain("일정 참여");
    expect(out).not.toContain("일정 개설"); // 0점 줄은 감춘다
    expect(out).not.toContain("목표 달성");
  });

  it("점수가 0이면 줄 대신 아직 없다고 말한다", () => {
    const out = html(
      createElement(PbScoreboard, {
        scoreboard: BOARD,
        rule: PB_DEFAULT_RULE,
        myGrpId: "g1",
        me: { memId: "m1", late: false },
      }),
    );

    expect(out).toContain("0점");
    expect(out).toContain("아직 점수가 없어요");
  });

  it("늦은 합류자에겐 0점 대신 팀전 제외를 말한다", () => {
    const out = html(
      createElement(PbScoreboard, {
        scoreboard: BOARD,
        rule: PB_DEFAULT_RULE,
        myGrpId: null,
        me: { memId: "m1", late: true },
      }),
    );

    expect(out).toContain("늦은 합류는 팀 점수에 들어가지 않아요");
    expect(out).not.toContain("아직 점수가 없어요");
  });

  it("게임팀이 없는 참가자는 배정 안내가 선다", () => {
    const out = html(
      createElement(PbScoreboard, {
        scoreboard: { ...BOARD, members: [memberScore({ inGame: false, grpId: null })] },
        rule: PB_DEFAULT_RULE,
        myGrpId: null,
        me: { memId: "m1", late: false },
      }),
    );

    expect(out).toContain("게임팀이 정해지면 점수가 쌓여요");
  });
});

describe("teamColorClass", () => {
  it("색 번호는 토큰 클래스로, 없으면 muted 로 떨어진다", () => {
    expect([1, 2, 3, 4, 5].map(teamColorClass)).toEqual([
      "bg-chart-1",
      "bg-chart-2",
      "bg-chart-3",
      "bg-chart-4",
      "bg-chart-5",
    ]);
    expect(teamColorClass(null)).toBe("bg-muted");
    expect(teamColorClass(9)).toBe("bg-muted");
  });
});

// ─────────────────────────────────────────
// 내 팀
// ─────────────────────────────────────────

describe("PbMyTeam", () => {
  const groups = BOARD.groups;

  it("훈련팀과 게임팀(이름)을 나란히 말한다", () => {
    const out = html(createElement(PbMyTeam, { groups, me: { trnGrpCd: "A", grpId: "g2", late: false } }));

    expect(out).toContain("훈련팀");
    expect(out).toContain("게임팀");
    expect(out).toContain(">A<");
    expect(out).toContain("번개팀");
    expect(out).toContain("bg-chart-2");
    expect(out).not.toContain("배정 전");
  });

  it("아직 배정 전이면 두 줄 모두 배정 전이다", () => {
    const out = html(createElement(PbMyTeam, { groups, me: { trnGrpCd: null, grpId: null, late: false } }));

    expect(out.match(/배정 전/g)).toHaveLength(2);
  });

  it("늦은 합류자는 게임팀을 배정 전이 아니라 해당 없음으로 말한다", () => {
    const out = html(createElement(PbMyTeam, { groups, me: { trnGrpCd: "B", grpId: null, late: true } }));

    expect(out).toContain("늦은 합류 — 팀전 대상이 아니에요");
    expect(out).toContain("해당 없음");
    expect(out.match(/배정 전/g)).toBeNull();
  });
});

// ─────────────────────────────────────────
// 목표
// ─────────────────────────────────────────

describe("PbGoalCard", () => {
  const base = { evtId: "e1", goalMaxSec: 3600, editUntilWk: 2 };

  it("고칠 수 있는 동안엔 버튼과 마감 주차·한도 안내가 선다", () => {
    const out = html(createElement(PbGoalCard, { ...base, goalSec: 3000, editable: true, achieved: false }));

    expect(out).toContain("50:00");
    expect(out).toContain("목표 고치기");
    expect(out).toContain("W2까지 고칠 수 있어요 · 60분 이내");
  });

  it("목표가 없으면 정하기 버튼이 서고 값 자리는 미설정이다", () => {
    const out = html(createElement(PbGoalCard, { ...base, goalSec: null, editable: true, achieved: false }));

    expect(out).toContain("목표 정하기");
    expect(out).toContain("아직 정하지 않았어요");
  });

  it("잠기면 버튼이 없고 확정을 말한다", () => {
    const out = html(createElement(PbGoalCard, { ...base, goalSec: 3000, editable: false, achieved: false }));

    expect(out).toContain("목표가 확정됐어요");
    expect(out).not.toContain("목표 고치기");
    expect(out).not.toContain("까지 고칠 수 있어요");
  });

  it("달성하면 배지가 붙는다", () => {
    const yes = html(createElement(PbGoalCard, { ...base, goalSec: 3000, editable: false, achieved: true }));
    const no = html(createElement(PbGoalCard, { ...base, goalSec: 3000, editable: false, achieved: false }));

    expect(yes).toContain("목표 달성");
    expect(no).not.toContain("목표 달성");
  });
});

// ─────────────────────────────────────────
// 기록
// ─────────────────────────────────────────

describe("PbRecordsCard", () => {
  const base = { evtId: "e1", midWkNo: 6 };

  it("정식 참가자는 기준·중간·최종과 대구 입력까지 네 줄이다", () => {
    const out = html(
      createElement(PbRecordsCard, {
        ...base,
        joinWkNo: 1,
        late: false,
        recs: { BASE_5K: { sec: 1500, cnfm: true } },
      }),
    );

    expect(out).toContain("W1 5K TT · 기준");
    expect(out).toContain("25:00");
    expect(out).toContain("W6 5K TT · 중간점검");
    expect(out).toContain("10K TT · 최종");
    expect(out).toContain("대구마라톤 10K");
    expect(out).toContain("운영진이 입력해요"); // 아직 기록 없는 줄
    expect(out).not.toContain("기준기록은");
  });

  it("W2~W5 합류자는 W1 줄이 없고 W6 5K가 기준기록이다", () => {
    const out = html(createElement(PbRecordsCard, { ...base, joinWkNo: 3, late: false, recs: {} }));

    expect(out).not.toContain("W1 5K TT");
    expect(out).toContain("W6 5K TT · 기준");
    expect(out).toContain("W3 합류라 기준기록은 W6 5K 기록이에요");
  });

  it("늦은 합류자는 최종 10K와 대구만 남고 기록 점수 없음을 말한다", () => {
    const out = html(createElement(PbRecordsCard, { ...base, joinWkNo: 6, late: true, recs: {} }));

    expect(out).not.toContain("5K TT");
    expect(out).toContain("10K TT · 최종");
    expect(out).toContain("대구마라톤 10K");
    expect(out).toContain("기록 점수가 없어요");
  });

  it("대구 기록이 없으면 올리기, 확인 대기면 고치기·지우기 + 배지", () => {
    const none = html(createElement(PbRecordsCard, { ...base, joinWkNo: 1, late: false, recs: {} }));
    expect(none).toContain("올리기");

    const waiting = html(
      createElement(PbRecordsCard, {
        ...base,
        joinWkNo: 1,
        late: false,
        recs: { DAEGU_10K: { sec: 3150, cnfm: false } },
      }),
    );
    expect(waiting).toContain("52:30");
    expect(waiting).toContain("확인 대기");
    expect(waiting).toContain("고치기");
    expect(waiting).toContain("지우기");
  });

  it("확인된 대구 기록은 더 손댈 수 없다", () => {
    const out = html(
      createElement(PbRecordsCard, {
        ...base,
        joinWkNo: 1,
        late: false,
        recs: { DAEGU_10K: { sec: 3150, cnfm: true } },
      }),
    );

    expect(out).toContain("52:30");
    expect(out).toContain("확인됨");
    expect(out).not.toContain("지우기");
    expect(out).not.toContain("고치기");
    expect(out).not.toContain("올리기");
  });
});

// ─────────────────────────────────────────
// 정산
// ─────────────────────────────────────────

const CFG = PB_CLASS_DEFAULT_CFG;

function sessions(): PbSession[] {
  const w1 = dayjs("2026-11-04T19:30:00+09:00");
  return Array.from({ length: 13 }, (_, i) => ({
    gthrId: `g${i + 1}`,
    wkNo: i + 1,
    sessType: i + 1 === 13 ? ("MEASURE" as const) : ("TRAINING" as const),
    held: i + 1 <= 4,
    gthrNm: `W${i + 1} 훈련`,
    sttAt: w1.add(i * 7, "day").toISOString(),
    delYn: false,
    computedWkNo: i + 1,
    attdCnt: 0,
  }));
}

function participant(over: { prtId: string; memId: string; memNm: string; joinWkNo: number; aprvYn: boolean; attended: string[] }): PbParticipant {
  const depositAmt = over.joinWkNo >= CFG.lateJoinWkNo ? 0 : CFG.depositAmt;
  return {
    prtId: over.prtId,
    memId: over.memId,
    memNm: over.memNm,
    avatarUrl: null,
    joinWkNo: over.joinWkNo,
    depositAmt,
    entryFeeAmt: CFG.entryFeeAmt,
    aprvYn: over.aprvYn,
    aprvAt: null,
    summary: summarizeRefund({
      joinWkNo: over.joinWkNo,
      depositAmt,
      links: sessions(),
      attendedGthrIds: new Set(over.attended),
      cfg: CFG,
    }),
    attendedGthrIds: over.attended,
  };
}

function board(participants: PbParticipant[]): PbClassBoard {
  const approved = participants.filter((p) => p.aprvYn);
  return {
    evt: { evtId: "e1", evtNm: "겨울 10K PB 클래스", sttDt: "2026-11-04", endDt: "2027-02-03", sttsEnm: "ACTIVE" },
    cfg: CFG,
    cfgSaved: true,
    sessions: sessions(),
    participants,
    totals: {
      aprvCnt: approved.length,
      pendingCnt: participants.length - approved.length,
      depositSum: approved.reduce((n, p) => n + p.depositAmt, 0),
      refundSum: approved.reduce((n, p) => n + p.summary.refund, 0),
      unrefundedSum: approved.reduce((n, p) => n + p.summary.unrefunded, 0),
      entryFeeSum: approved.reduce((n, p) => n + p.entryFeeAmt, 0),
    },
  };
}

describe("PbSettlement", () => {
  const people = [
    participant({ prtId: "a", memId: "m1", memNm: "가나다", joinWkNo: 1, aprvYn: true, attended: ["g1", "g2", "g4"] }),
    participant({ prtId: "b", memId: "m2", memNm: "라마바", joinWkNo: 1, aprvYn: true, attended: [] }),
    participant({ prtId: "c", memId: "m3", memNm: "늦은이", joinWkNo: 6, aprvYn: true, attended: ["g6"] }),
    participant({ prtId: "d", memId: "m4", memNm: "대기자", joinWkNo: 1, aprvYn: false, attended: [] }),
  ];

  it("합계 세 칸과 안내 문구를 보여 준다", () => {
    const b = board(people);
    const out = html(createElement(PbSettlement, { board: b }));

    expect(out).toContain("보증금 합계");
    expect(out).toContain(`${b.totals.depositSum.toLocaleString()}원`); // 승인 2명 × 3만 원
    expect(out).toContain("환급 예정");
    expect(out).toContain("미환급");
    expect(out).toContain("출석이 늘면 매주 바뀌어요. 시즌이 끝나면 이 금액으로 정산해요.");
  });

  it("승인된 참가자만 목록에 올리고 입금 대기자는 뺀다", () => {
    const out = html(createElement(PbSettlement, { board: board(people) }));

    expect(out).toContain("가나다");
    expect(out).toContain("라마바");
    expect(out).not.toContain("대기자");
  });

  it("출석 횟수와 환급액을 줄마다 찍는다", () => {
    const out = html(createElement(PbSettlement, { board: board(people) }));

    expect(out).toContain("3회");
    expect(out).toContain("10,000원"); // 3회 출석 → 보증금의 3/9
    expect(out).toMatch(/>0원</); // 출석 0회 — 30,000원 같은 큰 금액의 꼬리와 헷갈리지 않게 칸 전체로 본다
  });

  it("늦은 합류자는 0원이 아니라 환급 없음이다", () => {
    const out = html(createElement(PbSettlement, { board: board(people) }));

    expect(out).toContain("늦은이");
    expect(out).toContain("환급 없음");
    expect(out.match(/환급 없음/g)).toHaveLength(1); // 정식 참가자에겐 안 붙는다
  });

  it("내 줄에만 나 표시가 붙는다", () => {
    const out = html(createElement(PbSettlement, { board: board(people), myMemId: "m2" }));

    expect(out.match(/>나</g)).toHaveLength(1);
    expect(out.indexOf(">나<")).toBeGreaterThan(out.indexOf("라마바"));
  });
});
