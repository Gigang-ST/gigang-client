import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 대회 캐시 비우기 — 참가 신청(팀 것)은 그 팀 일정·피드만, 대회 원본(공용)은 전체 목록.
 * 예전엔 참가 신청 하나에도 전역 `competitions` 를 비워 모든 팀 홈 피드를 다시 계산했고 이 팀 일정은 안 비웠다(#653).
 */
const h = vi.hoisted(() => ({ tags: [] as string[], user: { id: "u1" } as { id: string } | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: (tag: string) => h.tags.push(tag) }));
vi.mock("@/lib/queries/request-team", () => ({ getRequestTeamContext: async () => ({ teamId: "team-a" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));

const { revalidateCompetitions, revalidateTeamCompetitionPlans } = await import("@/app/actions/revalidate-competitions");

beforeEach(() => {
  h.tags = [];
  h.user = { id: "u1" };
});

describe("revalidateTeamCompetitionPlans — 참가 신청이 바뀐 뒤", () => {
  it("이 팀의 일정·피드만 비우고 전역 competitions 는 건드리지 않는다", async () => {
    await revalidateTeamCompetitionPlans();
    expect(h.tags).toEqual(["home-calendar:team-a", "story-feed:team-a"]);
  });

  it("로그인 안 했으면 거절한다", async () => {
    h.user = null;
    await expect(revalidateTeamCompetitionPlans()).rejects.toThrow();
    expect(h.tags).toEqual([]);
  });
});

describe("revalidateCompetitions — 대회 원본(공용)이 바뀐 뒤", () => {
  it("공용 대회 목록을 비운다", async () => {
    await revalidateCompetitions();
    expect(h.tags).toEqual(["competitions"]);
  });
});
