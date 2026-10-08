import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PB_DEFAULT_RULE, type PbScoreboard as PbScoreboardData } from "@/lib/pb-class-score";

import { PbMyScore } from "@/components/projects/pb-class/pb-my-score";
import { PbScoreboard } from "@/components/projects/pb-class/pb-scoreboard";

// HelpTip 은 팝오버라 본문이 열기 전엔 마크업에 없다 — 이 파일은 그 **본문 문구**를 보려는 것이므로
// 제목·본문을 그대로 펼쳐 주는 가짜로 바꾼다. (다른 렌더 테스트는 팝오버 본문이 섞이면 줄 수·항목 단언이
// 흔들려서 파일을 따로 뒀다.)
vi.mock("@/components/common/help-tip", async () => {
  const { createElement: h } = await import("react");
  return {
    HelpTip: ({ title, children }: { title: string; children: ReactNode }) =>
      h("aside", { "data-help": title }, h("b", null, title), children),
  };
});

const BOARD: PbScoreboardData = {
  members: [
    {
      prtId: "p1",
      memId: "m1",
      memNm: "홍길동",
      grpId: "g1",
      inGame: true,
      total: 10,
      byCd: { ATTEND: 10, JOIN: 0, HOST: 0, IMPROVE_MID: 0, IMPROVE_FINAL: 0, GOAL: 0 },
      entries: [],
      goalAchieved: false,
    },
  ],
  groups: [
    {
      grpId: "g1",
      grpNm: "불꽃팀",
      colorNo: 1,
      memberCnt: 5,
      avgSum: 10,
      allAttendWeeks: [],
      allAttendBonus: 0,
      total: 10,
      rank: 1,
    },
  ],
};

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

/** 이 파일은 도움말 문구만 본다 — 팀 그래프·트랙에 쓸 참가자는 비워 둔다 */
const NO_GAME_EXTRAS = { participants: [], measureWkNo: null };

describe("점수판 도움말 — 팀 점수 공식", () => {
  const out = html(
    createElement(PbScoreboard, { ...NO_GAME_EXTRAS,
      scoreboard: BOARD,
      rule: PB_DEFAULT_RULE,
      myGrpId: "g1",
      me: { memId: "m1" },
    }),
  );

  it("팀 점수는 주마다 팀원 1인당 평균 점수의 합 + 전원 출석 보너스다", () => {
    expect(out).toContain("팀 점수는 이렇게 매겨요");
    expect(out).toContain("팀 점수 = 주마다 팀원 1인당 평균 점수의 합 + 전원 출석 보너스.");
    expect(out).toContain(`보너스 +${PB_DEFAULT_RULE.pt.allAttend}점이에요`);
  });

  it("팀 미션은 도움말 어디에도 없다(오너 지시)", () => {
    expect(out).not.toContain("미션");
  });
});

describe("Week by Week 도움말 — 지금 서 있는 면만 설명한다", () => {
  const render = (me: { memId: string } | null) =>
    html(
      createElement(PbScoreboard, {
        ...NO_GAME_EXTRAS,
        scoreboard: BOARD,
        rule: PB_DEFAULT_RULE,
        myGrpId: me ? "g1" : null,
        me,
        crew: createElement("div", { "data-crew": "" }),
      }),
    );

  it("참가자에겐 누적 출석·팀 점수 둘 다", () => {
    const out = render({ memId: "m1" });
    const help = out.slice(out.indexOf('data-help="그래프 읽는 법"'));
    expect(help).toContain("누적 출석");
    expect(help).toContain("합류 전 회차는 세지 않고");
    expect(help).toContain("선 끝이 지금 팀 점수예요");
  });

  it("구경꾼에겐 팀 점수만 — 보지도 않는 출석 그래프를 설명하지 않는다", () => {
    const out = render(null);
    const help = out.slice(out.indexOf('data-help="그래프 읽는 법"'));
    expect(help).toContain("선 끝이 지금 팀 점수예요");
    expect(help).not.toContain("합류 전 회차는 세지 않고");
  });
});

describe("내 점수 도움말 — 배점은 설정값(rule)에서", () => {
  it("rule 이 바뀌면 숫자도 바뀐다", () => {
    const rule = { ...PB_DEFAULT_RULE, pt: { ...PB_DEFAULT_RULE.pt, attend: 7, goal: 33 } };
    const out = html(createElement(PbMyScore, { memId: "m1", scoreboard: BOARD, rule }));
    expect(out).toContain("점수는 이렇게 쌓여요");
    expect(out).toContain("출석 7점");
    expect(out).toContain("목표 달성 33점");
  });
});
