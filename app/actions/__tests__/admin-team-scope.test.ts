import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/app/api/mcp/__tests__/fake-supabase";

/**
 * 관리자 액션의 팀 경계 회귀 테스트.
 *
 * 서버 액션은 service_role 로 써서 RLS 가 없다. `withAdmin` 은 "접속한 팀의 관리자인가"만 보므로,
 * 대상 id 가 그 팀 것인지 액션이 직접 확인하지 않으면 울산 관리자가 기강 데이터를 고칠 수 있다.
 * 여기서는 **울산 주소로 접속한 울산 관리자**가 기강 대상을 건드리는 상황을 재현한다.
 */

const GIGANG = "team-gigang";
const ULSAN = "team-ulsan";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  teamId: "team-ulsan",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNoti: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/cmm-cd-cached", () => ({
  getCachedCmmCdRows: async () => [],
  cmmCdRowsForGrp: () => [],
}));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: h.teamId, teamCd: "ulsan" }),
}));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdmin: async (fn: any) => fn({ member: { id: "mem-ulsan-admin", admin: true, status: "active" } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => h.db.asClient(),
  createUntypedAdminClient: () => h.db.asClient(),
}));

import { grantTitle as grantTitleFromMembers } from "@/app/actions/admin/grant-title";
import { grantTitle as grantTitleFromTitles } from "@/app/actions/admin/manage-title";
import { revokeTitle as revokeTitleFromMembers } from "@/app/actions/admin/revoke-title";

beforeEach(() => {
  h.teamId = ULSAN;
  h.db = new FakeSupabase({
    team_mem_rel: [
      { team_mem_id: "tm-gigang", team_id: GIGANG, mem_id: "mem-a", vers: 0, del_yn: false },
      { team_mem_id: "tm-ulsan", team_id: ULSAN, mem_id: "mem-b", vers: 0, del_yn: false },
    ],
    ttl_mst: [
      { ttl_id: "ttl-gigang", team_id: GIGANG, ttl_nm: "기강인", vers: 0, del_yn: false },
      { ttl_id: "ttl-ulsan", team_id: ULSAN, ttl_nm: "울산인", vers: 0, del_yn: false },
    ],
    mem_ttl_rel: [
      {
        mem_ttl_id: "mt-gigang",
        team_id: GIGANG,
        team_mem_id: "tm-gigang",
        ttl_id: "ttl-gigang",
        is_prmy_yn: true,
        vers: 0,
        del_yn: false,
      },
    ],
  });
});

describe("칭호 수여 — 회원 관리 화면(grant-title)", () => {
  it("다른 팀 회원에게는 줄 수 없다", async () => {
    const res = await grantTitleFromMembers("tm-gigang", "ttl-ulsan");
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
  });

  it("다른 팀 칭호는 줄 수 없다", async () => {
    const res = await grantTitleFromMembers("tm-ulsan", "ttl-gigang");
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
  });

  it("우리 팀 회원·우리 팀 칭호면 접속한 팀으로 기록된다", async () => {
    const res = await grantTitleFromMembers("tm-ulsan", "ttl-ulsan");
    expect(res.ok).toBe(true);
    const [insert] = h.db.opsOn("mem_ttl_rel", "insert");
    expect(insert.payload).toMatchObject({ team_id: ULSAN, team_mem_id: "tm-ulsan", ttl_id: "ttl-ulsan" });
  });
});

describe("칭호 수여 — 칭호 관리 화면(manage-title)", () => {
  it("다른 팀 칭호는 줄 수 없다", async () => {
    const res = await grantTitleFromTitles("ttl-gigang", "tm-ulsan", null);
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
  });

  it("다른 팀 회원에게 대표로 주려 해도 그 회원의 대표 칭호를 건드리지 않는다", async () => {
    const res = await grantTitleFromTitles("ttl-ulsan", "tm-gigang", null, true);
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "update")).toHaveLength(0);
    expect(h.db.tables.mem_ttl_rel.find((r) => r.mem_ttl_id === "mt-gigang")?.is_prmy_yn).toBe(true);
  });
});

describe("칭호 회수 — 회원 관리 화면(revoke-title)", () => {
  it("다른 팀 보유 칭호는 회수할 수 없다", async () => {
    const res = await revokeTitleFromMembers("mt-gigang");
    expect(res.ok).toBe(false);
    expect(h.db.tables.mem_ttl_rel.find((r) => r.mem_ttl_id === "mt-gigang")?.del_yn).toBe(false);
  });

  it("같은 팀이면 회수된다", async () => {
    h.teamId = GIGANG;
    const res = await revokeTitleFromMembers("mt-gigang");
    expect(res.ok).toBe(true);
    expect(h.db.tables.mem_ttl_rel.find((r) => r.mem_ttl_id === "mt-gigang")?.del_yn).toBe(true);
  });
});
