import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PB_DEFAULT_RULE as RULE,
  computeScoreboard,
  type PbRecType,
  type PbScoreGathering,
  type PbScoreboard as PbScoreboardData,
} from "@/lib/pb-class-score";
import type { PbGameParticipant } from "@/lib/queries/pb-class-game";

import { PbScoreboard } from "@/components/projects/pb-class/pb-scoreboard";

// 팀 그래프(recharts)는 클라이언트 전용 동적 로드라 서버 마크업엔 안 그려진다 — 자리만 확인한다
vi.mock("@/components/projects/pb-class/pb-team-score-chart-dynamic", async () => {
  const { createElement: h } = await import("react");
  return { PbTeamScoreChartDynamic: () => h("div", { "data-team-chart": "" }) };
});

/**
 * 점수판 탭 개편(2026-10-08) — 팀 그래프 · 10K 트랙 · 크루 출석이 **누구에게 보이는지**를 마크업으로 못박는다.
 *
 * - 팀 단위 숫자(순위·팀 그래프)는 구경꾼도 본다.
 * - 이름이 실리는 섹션(10K 트랙·크루 출석·내 점수)은 승인된 참가자에게만. 화면에서 숨기는 게 아니라
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

function render(over: { me?: { memId: string; late: boolean } | null; sb?: PbScoreboardData } = {}) {
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

describe("점수판 — 공개 범위", () => {
  it("구경꾼(승인 전)은 팀 순위와 팀 그래프만 본다 — 트랙·크루 출석·이름은 없다", () => {
    const out = render({ me: null });

    expect(out).toContain("Team Race");
    expect(out).toContain("data-team-chart");
    expect(out).not.toContain("10K Forecast");
    expect(out).not.toContain("data-crew");
    expect(out).not.toContain("My Score");
    for (const nm of ["홍길동", "가람", "나래", "다온", "대기자"]) expect(out).not.toContain(nm);
  });

  it("승인된 참가자는 팀 순위 → 팀 그래프 → 내 점수 → 10K 트랙 → 크루 출석 순으로 본다", () => {
    const out = render({ me: { memId: "me", late: false } });
    const at = (s: string) => out.indexOf(s);

    for (const s of ["Scoreboard", "Team Race", "My Score", "10K Forecast", "data-crew"]) expect(at(s)).toBeGreaterThan(-1);
    expect(at("Scoreboard")).toBeLessThan(at("Team Race"));
    expect(at("Team Race")).toBeLessThan(at("My Score"));
    expect(at("My Score")).toBeLessThan(at("10K Forecast"));
    expect(at("10K Forecast")).toBeLessThan(at("data-crew"));
  });

  it("늦은 합류자도 승인된 참가자라 트랙·크루 출석을 본다", () => {
    const out = render({ me: { memId: "me", late: true } });
    expect(out).toContain("10K Forecast");
    expect(out).toContain("data-crew");
  });
});

describe("팀 그래프(Team Race)", () => {
  it("범례가 순위표 순서대로 팀 이름과 지금 점수를 단다(스크린리더 요약도)", () => {
    const sb = scoreboard();
    const out = render({ sb });
    const caption = out.slice(out.indexOf("<figcaption"), out.indexOf("</figcaption>"));

    expect(caption).toContain(sb.groups.map((g) => `${g.grpNm} ${g.total}점`).join(", "));
    const legend = out.slice(out.indexOf("Team Race"));
    expect(legend.indexOf(sb.groups[0].grpNm)).toBeLessThan(legend.indexOf(sb.groups[1].grpNm));
  });

  it("팀은 있는데 아직 점수가 없으면 빈 상태, 팀 발표 전엔 섹션째 없다", () => {
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

    const none = render({ sb: { members: [], groups: [] } });
    expect(none).toContain("팀 발표 전이에요");
    expect(none).not.toContain("Team Race");
  });
});

describe("10K 트랙", () => {
  const out = render({ me: { memId: "me", late: false } });

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
        me: { memId: "me", late: false },
        participants: PARTICIPANTS.map((p) => ({ ...p, recs: {} })),
        measureWkNo: 13,
      }),
    );
    expect(bare).toContain("5K 기록이 올라오면 트랙에 서요");
  });
});
