import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PB_DEFAULT_RULE as RULE, computeScoreboard } from "@/lib/pb-class-score";
import { PB_STREAK_EMOJI, type PbTeamMember, type PbTeams as PbTeamsData } from "@/lib/pb-class-teams";
import type { StoryPost } from "@/lib/queries/story-posts";

import { PbScoreboard } from "@/components/projects/pb-class/pb-scoreboard";
import { PbTeams } from "@/components/projects/pb-class/pb-teams";

// 사진 줄은 릴스 뷰어를 물고 있는 클라이언트 섬이다 — 자리와 받은 장 수만 확인한다
vi.mock("@/components/projects/pb-class/pb-team-photos", async () => {
  const { createElement: h } = await import("react");
  return {
    PbTeamPhotos: ({ posts }: { posts: unknown[] }) => h("div", { "data-team-photos": posts.length }),
  };
});
vi.mock("@/components/projects/pb-class/pb-team-score-chart-dynamic", async () => {
  const { createElement: h } = await import("react");
  return { PbTeamScoreChartDynamic: () => h("div") };
});

/**
 * 점수판 ④ Teams(#621) — **무엇이 보이고 무엇이 안 보이는지**를 마크업으로 못박는다.
 * - 팀원 줄엔 얼굴·이름·훈련팀·예상 10K·빨라진 만큼·목표만. 출석 횟수는 팀 단위(「n/m명」)로만.
 * - 빨라지지 않은 사람·목표 없는 사람·0주 연속은 그 줄을 안 그린다(못한 건 세지 않는다).
 * - 구경꾼(`me` 없음)에겐 칸 자체가 없다.
 * - 카드는 넘겨 보는 한 장씩(#624) — 첫 장은 내 팀, 팀 없음은 끝 장. 안 보이는 장도 마크업엔 있다.
 */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const member = (memId: string, memNm: string, over: Partial<PbTeamMember> = {}): PbTeamMember => ({
  memId,
  memNm,
  avatarUrl: null,
  isMe: false,
  trnGrpCd: null,
  pred10kSec: null,
  fasterSec: null,
  goalSec: null,
  joinWkNo: 1,
  late: false,
  ...over,
});

const DATA: PbTeamsData = {
  glance: { label: "3주차", attdCnt: 5, eligibleCnt: 7, all: false, fasterSec: 65 },
  teams: [
    {
      grpId: "A",
      grpNm: "번개팀",
      colorNo: 1,
      isMine: true,
      rank: 1,
      total: 52.5,
      recent: { label: "3주차", attdCnt: 3, eligibleCnt: 4 },
      week: { wkNo: 3, gain: 12.5, rankMove: 1 },
      allAttendStreak: 2,
      bars: [
        { tick: "1", label: "1주차", rate: 1, canceled: false },
        { tick: "2", label: "2주차", rate: null, canceled: true },
        { tick: "3", label: "3주차", rate: 0.75, canceled: false },
      ],
      members: [
        member("me", "홍길동", { isMe: true, pred10kSec: 2650, fasterSec: 70, goalSec: 2580 }),
        member("a", "가람", { pred10kSec: 3000 }),
      ],
    },
    {
      grpId: "B",
      grpNm: "파도팀",
      colorNo: 2,
      isMine: false,
      rank: 2,
      total: 40,
      recent: { label: "3주차", attdCnt: 2, eligibleCnt: 3 },
      week: { wkNo: 3, gain: 8, rankMove: -1 },
      allAttendStreak: 0,
      bars: [],
      members: [member("b", "나래")],
    },
  ],
  noTeam: [member("late", "다온", { joinWkNo: 7, late: true })],
};

const posts = (n: number) => Array.from({ length: n }, (_, i) => ({ post_id: `p${i}`, mem_id: "me" }) as StoryPost);
const VIEWER = { teamId: "t1", memId: "me", memNm: "홍길동", avatarUrl: null };

function render(data = DATA, photos = new Map([["A", posts(4)]])) {
  return html(createElement(PbTeams, { data, measureWkNo: 13, photosByGrp: photos, viewer: VIEWER }));
}

describe("PbTeams", () => {
  it("크루 한 줄 — 출석을 먼저, 빨라진 만큼을 뒤에", () => {
    const out = render();
    expect(out).toContain("3주차엔");
    expect(out).toContain("크루 평균 10K가 1주차보다");
    expect(out).toContain("1:05");
  });

  it("빨라지지 않았으면 크루 한 줄의 뒷절을 뺀다", () => {
    const out = render({ ...DATA, glance: { ...DATA.glance!, fasterSec: null } });
    expect(out).toContain("이 나왔어요");
    expect(out).not.toContain("크루 평균 10K");
  });

  it("팀 머리 — 팀 출석은 팀 단위 n/m명, 순위·이번 주 점수·변동, 연속 배지", () => {
    const out = render();
    expect(out).toContain("최근 회차");
    expect(out).toContain("3/4명");
    expect(out).toContain("1위");
    expect(out).toContain("+12.5점");
    expect(out).toContain("▲");
    expect(out).toContain(`전원 출석 2주 연속 ${PB_STREAK_EMOJI}`);
    // 파도팀은 0주 연속 — 배지가 하나뿐이다
    expect(out.match(/주 연속/g)).toHaveLength(1);
    expect(out).toContain("취소");
  });

  it("팀원 줄 — 예상 10K·빨라진 만큼·목표. 빨라지지 않았거나 목표가 없으면 그 줄이 없다", () => {
    const out = render();
    expect(out).toContain("홍길동");
    expect(out).toContain("44:10");
    expect(out).toContain("▲1:10");
    expect(out).toContain("목표 43:00");
    expect(out).toContain("50:00");
    expect(out.match(/목표 /g)).toHaveLength(1);
    expect(out.match(/▲\d+:\d\d/g)).toHaveLength(1); // 순위 변동 ▲1 은 따로 센다
  });

  it("팀 없음 묶음엔 합류 주차가 붙는다", () => {
    const out = render();
    expect(out).toContain("팀 없음");
    expect(out).toContain("다온");
    expect(out).toContain("7주차 합류");
  });

  it("사진은 있는 팀에만 — 없는 팀엔 줄째 없다", () => {
    const out = render();
    expect(out.match(/data-team-photos="4"/g)).toHaveLength(1);
  });

  it("팀 발표 전이면 빈 상태 — 팀 없음 묶음은 한 장으로 남고 넘김 버튼은 없다", () => {
    const out = render({ ...DATA, teams: [] });
    expect(out).toContain("팀 발표 전이에요");
    expect(slideOrder(out)).toEqual(["1/1 팀 없음"]);
    expect(out).not.toContain("다음 팀");
  });
});

/** 넘김 장의 순서 — 각 장의 aria-label(「n/총 이름」)을 마크업 순서대로 */
const slideOrder = (out: string) => [...out.matchAll(/aria-roledescription="slide" aria-label="([^"]+)"/g)].map((m) => m[1]);

describe("PbTeams — 넘김(#624)", () => {
  it("첫 장은 내 팀 — 1위가 아니어도. 나머지는 순위 순서, 팀 없음은 맨 끝", () => {
    const [a, b] = DATA.teams;
    const third = { ...b, grpId: "C", grpNm: "바람팀", colorNo: 3, rank: 3 };
    const data = { ...DATA, teams: [{ ...a, isMine: false }, b, { ...third, isMine: true }] };
    expect(slideOrder(render(data))).toEqual(["1/4 바람팀 (내 팀)", "2/4 번개팀", "3/4 파도팀", "4/4 팀 없음"]);
  });

  it("내 팀이 없으면 1위부터", () => {
    const [a, b] = DATA.teams;
    const data = { ...DATA, teams: [b, { ...a, isMine: false }] };
    expect(slideOrder(render(data))).toEqual(["1/3 번개팀", "2/3 파도팀", "3/3 팀 없음"]);
  });

  it("첫 장만 보이고 나머지는 가려진다 — 이전 버튼은 꺼져 있고(감기지 않음) 위치를 읽어 준다", () => {
    const out = render();
    expect(out.match(/data-active="true"/g)).toHaveLength(1);
    expect(out.match(/aria-hidden="true" inert=""/g)).toHaveLength(2);
    expect(out).toMatch(/<button[^>]*aria-label="이전 팀"[^>]*disabled=""/);
    expect(out).not.toMatch(/<button[^>]*aria-label="다음 팀"[^>]*disabled=""/);
    expect(out).toContain("번개팀 (내 팀), </span>1/3");
  });
});

describe("PbScoreboard — Teams 칸 노출", () => {
  const scoreboard = computeScoreboard({ members: [], gatherings: [], groups: [], rule: RULE, measureWkNo: null });
  const base = { scoreboard, rule: RULE, myGrpId: null, participants: [], measureWkNo: null };
  const teams = createElement("div", { "data-teams-slot": "" });

  it("승인된 참가자에게는 맨 아래에 붙는다", () => {
    const out = html(createElement(PbScoreboard, { ...base, me: { memId: "me" }, teams }));
    expect(out).toContain("data-teams-slot");
  });

  it("구경꾼에게는 넘겨받아도 그리지 않는다", () => {
    const out = html(createElement(PbScoreboard, { ...base, me: null, teams }));
    expect(out).not.toContain("data-teams-slot");
  });
});
