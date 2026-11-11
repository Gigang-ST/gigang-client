import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 캐시 무효화 웹훅 — 팀이 오면 그 팀 태그만, 안 오면 공용 태그로 전부(멀티팀).
 * 트리거가 행의 팀을 실어 보낸다(supabase/migrations/20261109200000_revalidate_webhook_team.sql).
 */

const h = vi.hoisted(() => ({ tags: [] as string[] }));

vi.mock("next/cache", () => ({ revalidateTag: (tag: string) => h.tags.push(tag) }));
vi.mock("@/lib/env", () => ({ env: { REVALIDATE_SECRET: "s3cret" } }));
vi.mock("@/lib/queries/board", () => ({ BOARD_POSTS_CACHE_TAG: "board-posts" }));
vi.mock("@/lib/queries/home-calendar", () => ({ HOME_CALENDAR_CACHE_TAG: "home-calendar" }));

import { POST } from "@/app/api/revalidate/route";

const ULSAN = "c0ffee00-0000-4000-8000-000000000002";

function call(body: unknown, secret = "s3cret") {
  return POST(
    new Request("http://x/api/revalidate", {
      method: "POST",
      headers: { "x-webhook-secret": secret, "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  h.tags = [];
});

describe("/api/revalidate — 팀별 무효화", () => {
  it("모임·참석에 팀이 오면 그 팀 캘린더만 턴다(다른 팀 캘린더는 그대로)", async () => {
    await call({ table: "gthr_attd_rel", team_id: ULSAN });
    expect(h.tags).toEqual([`home-calendar:${ULSAN}`]);
  });

  it("팀이 없으면(옛 트리거·부모 행 없음) 공용 태그로 모든 팀을 턴다", async () => {
    await call({ table: "gthr_mst" });
    expect(h.tags).toEqual(["home-calendar"]);
  });

  it("팀 대회 계획·참가 신청은 그 팀 캘린더와 그 팀 피드만 — 공용 대회 목록은 안 턴다", async () => {
    await call({ table: "comp_reg_rel", team_id: ULSAN });
    expect(h.tags).toEqual([`home-calendar:${ULSAN}`, `story-feed:${ULSAN}`]);
  });

  it("대회 원본(comp_mst)은 공용이라 모든 팀", async () => {
    await call({ table: "comp_mst" });
    expect(h.tags).toEqual(["competitions", "home-calendar"]);
  });

  it("게시글은 그 팀 게시판만", async () => {
    await call({ table: "brd_post_mst", team_id: ULSAN });
    expect(h.tags).toEqual([`board-posts:${ULSAN}`]);
  });

  it("팀 값이 uuid 가 아니면 버리고 전부 턴다", async () => {
    await call({ table: "gthr_mst", team_id: "not-a-uuid" });
    expect(h.tags).toEqual(["home-calendar"]);
  });

  it("시크릿이 틀리면 아무것도 안 턴다", async () => {
    const res = await call({ table: "gthr_mst", team_id: ULSAN }, "wrong");
    expect(res.status).toBe(401);
    expect(h.tags).toEqual([]);
  });
});
