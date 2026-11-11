import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/app/api/mcp/__tests__/fake-supabase";

/**
 * 팀 설정 — 돈·공지가 걸린 설정(모임 계좌·카톡 공지방)은 owner 만 바꾸고, 바뀌면 다른 운영진에게 알린다.
 * 화면은 잠그지만 서버 액션은 화면과 별개로 열려 있다 — 액션이 직접 막아야 한다.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  member: { id: "mem-admin", full_name: "관리자", admin: true, owner: false },
  notified: [] as { memIds: string[]; notiTypeEnm: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: "team-a", teamCd: "gigang" }),
}));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdmin: async (fn: any) => fn({ member: h.member }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createUntypedAdminClient: () => h.db.asClient() }));
vi.mock("@/lib/team-cfg/read", () => ({ invalidateTeamCfgCache: vi.fn() }));
vi.mock("@/lib/notifications/insert-noti", () => ({
  insertNotiMany: vi.fn(async (a: { memIds: string[]; notiTypeEnm: string }) => {
    h.notified.push({ memIds: a.memIds, notiTypeEnm: a.notiTypeEnm });
  }),
}));

const { saveTeamSetting, resetTeamSetting } = await import("@/app/actions/admin/team-settings");

const ACCOUNT = { bank: "예시은행", number: "123-45-678", holder: "예시 운영진" };

beforeEach(() => {
  h.notified = [];
  h.member = { id: "mem-admin", full_name: "관리자", admin: true, owner: false };
  h.db = new FakeSupabase({
    team_cfg: [],
    team_mem_rel: [
      { mem_id: "mem-owner", team_id: "team-a", team_role_cd: "owner", mem_st_cd: "active", vers: 0, del_yn: false },
      { mem_id: "mem-admin", team_id: "team-a", team_role_cd: "admin", mem_st_cd: "active", vers: 0, del_yn: false },
    ],
  });
});

describe("팀 설정 — owner 전용", () => {
  it("owner 가 아닌 관리자는 계좌를 바꾸지도 지우지도 못한다", async () => {
    await expect(saveTeamSetting("bank.team_account", ACCOUNT)).resolves.toMatchObject({ ok: false });
    await expect(resetTeamSetting("bank.team_account")).resolves.toMatchObject({ ok: false });
    expect(h.db.opsOn("team_cfg", "insert")).toHaveLength(0);
    expect(h.db.opsOn("team_cfg", "update")).toHaveLength(0);
  });

  it("owner 는 바꾸고, 바꾼 사람을 뺀 다른 운영진에게 알림이 간다", async () => {
    h.member = { id: "mem-owner", full_name: "오너", admin: true, owner: true };
    await expect(saveTeamSetting("bank.team_account", ACCOUNT)).resolves.toEqual({ ok: true, message: null });
    expect(h.notified).toEqual([{ memIds: ["mem-admin"], notiTypeEnm: "team_cfg_chg" }]);
  });

  it("owner 전용이 아닌 설정은 관리자도 바꾸고 알림은 안 간다", async () => {
    await expect(saveTeamSetting("feature.dues", false)).resolves.toEqual({ ok: true, message: null });
    expect(h.notified).toEqual([]);
  });
});

describe("팀 설정 — 화면에 안 올리는(hidden) 키", () => {
  // 화면엔 없어도 서버 액션은 직접 부를 수 있다 — 액션이 막아야 한다(PR #649 리뷰). 이런 키는 마이그레이션으로만 바꾼다.
  it("관리자·owner 모두 저장도 되돌리기도 못 한다", async () => {
    for (const owner of [false, true]) {
      h.member = { id: owner ? "mem-owner" : "mem-admin", full_name: "운영진", admin: true, owner };
      await expect(saveTeamSetting("signup.other_teams", [{ team_cd: "ulsan", name: "아무 글자" }])).resolves.toMatchObject({ ok: false });
      await expect(resetTeamSetting("signup.other_teams")).resolves.toMatchObject({ ok: false });
    }
    expect(h.db.opsOn("team_cfg", "insert")).toHaveLength(0);
    expect(h.db.opsOn("team_cfg", "update")).toHaveLength(0);
  });
});
