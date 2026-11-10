import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/app/api/mcp/__tests__/fake-supabase";

/**
 * 칭호 기능을 끈 팀(feature.titles=false, 울산) — 사람이 주거나 고르는 길도 막힌다.
 * 화면은 진입점(관리자 칭호 수여 칸·프로필 컬렉션)을 숨기지만 서버 액션은 화면과 별개로 열려 있다 — 액션이 직접 거절해야 한다.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  titlesOn: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: "team-a", teamCd: "ulsan" }),
}));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdmin: async (fn: any) => fn({ member: { id: "mem-admin", team_mem_id: "tm-admin", admin: true } }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withActive: async (fn: any) => fn({ member: { id: "mem-1", team_mem_id: "tm-1" } }),
}));
vi.mock("@/lib/actions/team-scope", () => ({ isTeamMemIdInTeam: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db.asClient() }));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNoti: vi.fn() }));
vi.mock("@/lib/team-cfg/read", () => ({ getTeamCfg: vi.fn(async () => h.titlesOn) }));

const { grantTitle } = await import("@/app/actions/admin/grant-title");
const { setPrimaryTitle, setSelectedEffect } = await import("@/app/actions/profile/update-collection");

beforeEach(() => {
  h.titlesOn = false;
  h.db = new FakeSupabase({
    ttl_mst: [{ ttl_id: "ttl-1", team_id: "team-a", ttl_nm: "뉴비", vers: 0, del_yn: false, use_yn: true }],
    mem_ttl_rel: [{ team_mem_id: "tm-1", ttl_id: "ttl-1", is_prmy_yn: false, vers: 0, del_yn: false }],
    team_mem_rel: [{ team_mem_id: "tm-1", team_id: "team-a", vers: 0, del_yn: false }],
  });
});

describe("칭호 기능을 끈 팀 — 서버 액션 거절", () => {
  // 칭호가 없는 회원(tm-2)에게 준다 — 이미 가진 회원이면 "이미 보유"로도 거절돼, 막는 코드가 빠져도 통과해 버린다
  it("관리자 수동 수여를 거절하고 수여 행을 만들지 않는다", async () => {
    await expect(grantTitle("tm-2", "ttl-1")).resolves.toEqual({ ok: false, message: "칭호 기능을 쓰지 않는 크루예요." });
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
  });

  it("켠 팀은 같은 수여가 그대로 된다 — 위 거절이 칭호 기능 때문임을 보증한다", async () => {
    h.titlesOn = true;
    await expect(grantTitle("tm-2", "ttl-1")).resolves.toMatchObject({ ok: true });
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(1);
  });

  it("대표 칭호 고르기를 거절하고 아무것도 고치지 않는다", async () => {
    await expect(setPrimaryTitle("ttl-1")).resolves.toEqual({ ok: false, message: "칭호 기능을 쓰지 않는 크루예요." });
    expect(h.db.opsOn("mem_ttl_rel", "update")).toHaveLength(0);
  });

  it("칭호 이펙트·프레임 고르기를 거절한다", async () => {
    await expect(setSelectedEffect("glitch", "frame-rainbow")).resolves.toEqual({ ok: false, message: "칭호 기능을 쓰지 않는 크루예요." });
    expect(h.db.opsOn("team_mem_rel", "update")).toHaveLength(0);
  });

  it("켠 팀은 대표 칭호 고르기가 그대로 된다 — 막는 조건이 켬까지 막지 않는지", async () => {
    h.titlesOn = true;
    await expect(setPrimaryTitle("ttl-1")).resolves.toMatchObject({ ok: true });
  });
});
