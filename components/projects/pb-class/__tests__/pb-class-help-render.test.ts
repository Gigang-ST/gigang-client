import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PB_DEFAULT_RULE, type PbScoreboard as PbScoreboardData } from "@/lib/pb-class-score";

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

describe("점수판 도움말 — 팀 점수 공식", () => {
  const out = html(
    createElement(PbScoreboard, {
      scoreboard: BOARD,
      rule: PB_DEFAULT_RULE,
      myGrpId: "g1",
      me: { memId: "m1", late: false },
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
