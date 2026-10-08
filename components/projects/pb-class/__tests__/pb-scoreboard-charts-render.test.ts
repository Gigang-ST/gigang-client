import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PB_DEFAULT_RULE as RULE,
  computeScoreboard,
  type PbRecType,
  type PbScoreGathering,
  type PbScoreboard as PbScoreboardData,
} from "@/lib/pb-class-score";
import { buildPbTeamSeries, teamGlance } from "@/lib/pb-class-chart";
import type { PbGameParticipant } from "@/lib/queries/pb-class-game";

import { PbScoreboard } from "@/components/projects/pb-class/pb-scoreboard";

// 팀 그래프(recharts)는 클라이언트 전용 동적 로드라 서버 마크업엔 안 그려진다 — 자리만 확인한다
vi.mock("@/components/projects/pb-class/pb-team-score-chart-dynamic", async () => {
  const { createElement: h } = await import("react");
  return { PbTeamScoreChartDynamic: () => h("div", { "data-team-chart": "" }) };
});

// 세그먼트(클라이언트)는 고른 면 하나만 그린다 — 서버 마크업으로 「두 면이 다 넘어갔나」를 보려고 두 슬롯을 다 펼친다.
// 세그먼트 자체(기본값·순서)는 아래 「PbFlowViews」에서 진짜 컴포넌트로 따로 본다.
vi.mock("@/components/projects/pb-class/pb-flow-views", async () => {
  const { createElement: h } = await import("react");
  return {
    PbFlowViews: ({ crew, team }: { crew: ReactNode; team: ReactNode }) =>
      h("div", { "data-flow-views": "" }, h("div", { "data-slot": "crew" }, crew), h("div", { "data-slot": "team" }, team)),
  };
});

/**
 * 점수판 탭(2026-10-08 오너 — 두 번째 개편) — **순서와 누구에게 보이는지**를 마크업으로 못박는다.
 *
 * - 순서: ① Scoreboard(팀 순위) → ② 10K Forecast → ③ Week by Week(누적 출석 | 팀 점수). 출석표는 걷었다.
 *   「내 점수」는 내 현황 탭으로 갔다(`pb-class-game-render.test.ts`의 PbMyScore).
 * - 팀 단위 숫자(순위·팀 점수 면)는 구경꾼도 본다 — 세그먼트 없이 팀 점수 면만.
 * - 이름이 실리는 칸(10K 트랙·누적 출석)은 승인된 참가자에게만. 화면에서 숨기는 게 아니라
 *   **아예 안 그린다** — 트랙 데이터는 클라이언트 컴포넌트 props 라 그리면 RSC 로 실려 나간다.
 * 계산은 `lib/__tests__/pb-class-chart.test.ts`가 지킨다.
 */

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const recs = (r: Partial<Record<PbRecType, number>>) =>
  Object.fromEntries(Object.entries(r).map(([k, sec]) => [k, { sec, cnfm: true }])) as PbGameParticipant["recs"];

function prt(
  memId: string,
  memNm: string,
  over: Partial<PbGameParticipant> = {},
): PbGameParticipant {
  return {
    prtId: `p-${memId}`,
    memId,
    memNm,
    joinWkNo: 1,
    late: false,
    grpId: "A",
    goalSec: null,
    recs: {},
    aprvYn: true,
    trnGrpCd: null,
    trnGrpFixedCd: null,
    trnGrpAutoCd: null,
    avatarUrl: null,
    ...over,
  };
}

const PARTICIPANTS: PbGameParticipant[] = [
  prt("me", "홍길동", { recs: recs({ BASE_5K: 1380 }), goalSec: 2700 }),
  prt("a", "가람", { recs: recs({ MID_5K: 1300 }), grpId: "B" }),
  prt("b", "나래", { recs: recs({ FINAL_10K: 2500 }) }),
  prt("c", "다온", { grpId: "B" }), // 기록 없음
  prt("w", "대기자", { recs: recs({ BASE_5K: 1200 }), aprvYn: false, grpId: null }),
];

const linked = (wk: number, attendees: string[]): PbScoreGathering => ({
  gthrId: `t${wk}`,
  wkNo: wk,
  crtBy: "admin",
  attendeeMemIds: attendees,
  linked: "TRAINING",
});

const GROUPS = [
  { grpId: "A", grpNm: "불꽃팀", colorNo: 1 },
  { grpId: "B", grpNm: "번개팀", colorNo: 2 },
];

function scoreboard(gatherings: PbScoreGathering[] = [linked(1, ["me", "b", "a"]), linked(2, ["me", "c"])]) {
  return computeScoreboard({
    members: PARTICIPANTS.filter((p) => p.aprvYn),
    gatherings,
    groups: GROUPS,
    rule: RULE,
    measureWkNo: 13,
  });
}

const CREW = createElement("section", { "data-crew": "" }, "크루 출석 자리");

function render(over: { me?: { memId: string } | null; sb?: PbScoreboardData } = {}) {
  return html(
    createElement(PbScoreboard, {
      scoreboard: over.sb ?? scoreboard(),
      rule: RULE,
      myGrpId: over.me ? "A" : null,
      me: over.me ?? null,
      participants: PARTICIPANTS,
      measureWkNo: 13,
      crew: CREW,
    }),
  );
}

describe("점수판 — 순서와 공개 범위", () => {
  it("구경꾼(승인 전)은 팀 순위와 팀 점수 면만 본다 — 세그먼트·트랙·누적 출석·이름은 없다", () => {
    const out = render({ me: null });

    expect(out).toContain("Week by Week");
    expect(out).toContain("주마다 쌓인 팀 점수");
    expect(out).toContain("data-team-chart");
    expect(out).not.toContain("data-flow-views"); // 고를 게 하나면 세그먼트를 세우지 않는다
    expect(out).not.toContain("10K Forecast");
    expect(out).not.toContain("data-crew");
    expect(out).not.toContain("My Score");
    for (const nm of ["홍길동", "가람", "나래", "다온", "대기자"]) expect(out).not.toContain(nm);
  });

  it("승인된 참가자는 ① 팀 순위 → ② 10K 트랙 → ③ 그래프(누적 출석 | 팀 점수) 순으로 본다", () => {
    const out = render({ me: { memId: "me" } });
    const at = (s: string) => out.indexOf(s);

    for (const s of ["Scoreboard", "10K Forecast", "Week by Week", "data-crew", "data-team-chart"]) {
      expect(at(s)).toBeGreaterThan(-1);
    }
    expect(at("Scoreboard")).toBeLessThan(at("10K Forecast"));
    expect(at("10K Forecast")).toBeLessThan(at("Week by Week"));
    expect(out).toContain("주마다 쌓인 출석과 팀 점수");
    // 세그먼트 순서 = 누적 출석 → 팀 점수
    expect(at('data-slot="crew"')).toBeLessThan(at('data-slot="team"'));
    expect(at("data-crew")).toBeLessThan(at("data-team-chart"));
  });

  it("출석표·내 점수는 점수판에 없다", () => {
    const out = render({ me: { memId: "me" } });
    expect(out).not.toContain("출석표");
    expect(out).not.toContain("My Score");
    expect(out).not.toContain("Team Race"); // 팀 그래프는 따로 서지 않고 ③의 한 면이다
  });

  it("참가자에겐 팀 발표 전에도 팀 점수 면이 선다 — 세그먼트가 하나였다 둘이었다 하지 않게, 면 안에서 빈 상태", () => {
    const out = render({ me: { memId: "me" }, sb: { members: [], groups: [] } });
    const team = out.slice(out.indexOf('data-slot="team"'));

    expect(out).toContain("data-flow-views");
    expect(team).toContain("첫 점수가 쌓이면 그려져요");
  });
});

describe("PbFlowViews — 세그먼트", () => {
  it("누적 출석이 먼저이자 기본이고, 기본 면만 그린다", async () => {
    const { PbFlowViews } = await vi.importActual<typeof import("@/components/projects/pb-class/pb-flow-views")>(
      "@/components/projects/pb-class/pb-flow-views",
    );
    const out = html(
      createElement(PbFlowViews, {
        crew: createElement("i", { "data-crew": "" }),
        team: createElement("i", { "data-team": "" }),
      }),
    );

    expect(out.indexOf("누적 출석")).toBeLessThan(out.indexOf("팀 점수"));
    expect(out).toMatch(/aria-pressed="true"[^>]*>누적 출석</);
    expect(out).toContain("data-crew");
    expect(out).not.toContain("data-team");
  });
});

describe("팀 점수 면", () => {
  it("범례가 순위표 순서대로 팀 이름과 지금 점수를 단다(스크린리더 요약도)", () => {
    const sb = scoreboard();
    const out = render({ sb });
    const caption = out.slice(out.indexOf("<figcaption"), out.indexOf("</figcaption>"));

    expect(caption).toContain(sb.groups.map((g) => `${g.grpNm} ${g.total}점`).join(", "));
    const legend = out.slice(out.indexOf("<figure"));
    expect(legend.indexOf(sb.groups[0].grpNm)).toBeLessThan(legend.indexOf(sb.groups[1].grpNm));
  });

  it("그래프 위 한 줄은 마지막 주에 가장 많이 얻은 팀 — 누적 출석 면의 한 줄과 같은 자리", () => {
    // 2주차: 불꽃팀(홍길동·나래) 둘 다 출석 + 전원 출석 보너스 / 번개팀은 다온 혼자
    const sb = scoreboard([linked(1, ["me", "b", "a"]), linked(2, ["me", "b", "c"])]);
    // SSR 은 이웃한 텍스트 노드 사이에 주석을 끼운다 — 문장으로 읽으려고 걷는다
    const out = render({ sb }).replaceAll("<!-- -->", "");
    const g = teamGlance(buildPbTeamSeries({ scoreboard: sb, members: PARTICIPANTS, rule: RULE })!)!;

    expect(g.names).toEqual(["불꽃팀"]);
    expect(out).toContain("2주차에 가장 많이 얻은 팀 · ");
    expect(out).toMatch(/가장 많이 얻은 팀 · <span[^>]*>불꽃팀<\/span> <span[^>]*>\+\d+(\.\d)?점<\/span>/);
    expect(out.indexOf("가장 많이 얻은 팀")).toBeLessThan(out.indexOf("<figure"));
  });

  it("셋 이상 나란하면 이름 대신 「N팀 공동」 — 두 줄로 꺾여 그래프를 밀지 않게", () => {
    const four = [...GROUPS, { grpId: "C", grpNm: "바람팀", colorNo: 3 }, { grpId: "D", grpNm: "파도팀", colorNo: 4 }];
    const members = PARTICIPANTS.map((p, i) => ({ ...p, grpId: p.aprvYn ? ["A", "B", "C", "D"][i % 4] : null }));
    // 2주차: 홍길동(A)·가람(B)·나래(C) 혼자씩 나와 셋이 +10, 다온(D)만 0 → 3팀 공동
    const sb = computeScoreboard({
      members: members.filter((p) => p.aprvYn),
      gatherings: [linked(1, ["me", "a", "b", "c"]), linked(2, ["me", "a", "b"])],
      groups: four,
      rule: RULE,
      measureWkNo: 13,
    });
    const out = html(
      createElement(PbScoreboard, { scoreboard: sb, rule: RULE, myGrpId: null, me: null, participants: members, measureWkNo: 13 }),
    ).replaceAll("<!-- -->", "");

    expect(out).toMatch(/2주차에 가장 많이 얻은 팀 · <span[^>]*>3팀 공동<\/span>/);
  });

  it("마지막 주에 모든 팀이 똑같이 얻었으면 이름을 늘어놓지 않고 「모든 팀」", () => {
    // 2주차: 불꽃팀 홍길동 혼자 10/2 = 5, 번개팀 다온 혼자 10/2 = 5
    const out = render({ sb: scoreboard([linked(1, ["me", "b", "a"]), linked(2, ["me", "c"])]) }).replaceAll("<!-- -->", "");
    expect(out).toMatch(/2주차엔 모든 팀이 <span[^>]*>\+5점<\/span>씩 얻었어요/);
  });

  it("팀은 있는데 아직 점수가 없으면 빈 상태, 팀 발표 전엔 구경꾼에게 칸째 없다", () => {
    const quiet = computeScoreboard({
      members: PARTICIPANTS.filter((p) => p.aprvYn).map((p) => ({ ...p, recs: {} })),
      gatherings: [],
      groups: GROUPS,
      rule: RULE,
      measureWkNo: 13,
    });
    const q = render({ sb: quiet });
    expect(q).toContain("첫 점수가 쌓이면 그려져요");
    expect(q).not.toContain("data-team-chart");
    expect(q).not.toContain("가장 많이 얻은 팀");

    const none = render({ sb: { members: [], groups: [] } });
    expect(none).toContain("팀 발표 전이에요");
    expect(none).not.toContain("Week by Week");
  });
});

describe("10K 트랙", () => {
  const out = render({ me: { memId: "me" } });

  it("기록 있는 승인 참가자가 이름·예상기록·근거와 함께 선다 — 입금 대기자는 없다", () => {
    expect(out).toContain("가람 — 예상 10K 45:11 (6주차 5K × 2.085)");
    expect(out).toContain("나래 — 예상 10K 41:40 (10K 측정 기록)");
    expect(out).toContain("나 — 예상 10K 47:57 (1주차 5K × 2.085)");
    expect(out).not.toContain("대기자");
  });

  it("내 이름표는 늘 떠 있고, 판독줄은 처음엔 나를 말한다", () => {
    expect(out).toMatch(/bg-primary[^"]*"[^>]*><span[^>]*>나<\/span>/);
    expect(out).toContain("홍길동 (나)");
    // 남의 이름표는 누르기 전엔 없다(이름은 aria-label 에만)
    expect(out).not.toMatch(/>가람</);
  });

  it("기록이 없는 사람은 한 줄로만 센다 — 이름은 싣지 않는다", () => {
    expect(out).toContain("기록을 올리면 트랙에 서요 · 1명");
    expect(out).not.toContain("다온");
  });

  it("범례가 트랙 위 인원·중앙값·내 목표를 말한다", () => {
    expect(out).toMatch(/트랙 위 <span[^>]*>3명<\/span>/);
    expect(out).toContain("중앙값");
    expect(out).toMatch(/내 목표 <span[^>]*>45:00<\/span>/);
  });

  it("아무도 기록이 없으면 빈 상태", () => {
    const bare = html(
      createElement(PbScoreboard, {
        scoreboard: scoreboard(),
        rule: RULE,
        myGrpId: "A",
        me: { memId: "me" },
        participants: PARTICIPANTS.map((p) => ({ ...p, recs: {} })),
        measureWkNo: 13,
      }),
    );
    expect(bare).toContain("5K 기록이 올라오면 트랙에 서요");
  });
});
