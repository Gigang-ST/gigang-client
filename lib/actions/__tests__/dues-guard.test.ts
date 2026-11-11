import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 회비 액션 관문 — 회비를 끈 팀(울산)에서는 회비 액션이 아무것도 하지 않는다.
 * 화면만 숨기면 서버 액션은 그대로 열려 있다(울산 회원의 회비 문의 → 운영진 알림이 실제로 갔다).
 */

const h = vi.hoisted(() => ({ duesOn: true, ran: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: "team-ulsan", teamCd: "ulsan" }),
}));
vi.mock("@/lib/team-cfg/read", () => ({ getTeamCfg: async () => h.duesOn }));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdmin: async (fn: any) => fn({ member: { id: "m" } }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withMember: async (fn: any) => fn({ member: { id: "m" } }),
}));

const { withDuesAdmin, withDuesMember } = await import("@/lib/actions/dues-guard");

const action = async () => {
  h.ran += 1;
  return { ok: true as const };
};

beforeEach(() => {
  h.ran = 0;
});

describe("withDuesAdmin · withDuesMember", () => {
  it("회비를 끈 팀이면 액션 본문을 아예 안 돌린다", async () => {
    h.duesOn = false;
    await expect(withDuesAdmin(action)).resolves.toEqual({ ok: false, message: "이 팀은 회비 기능을 쓰지 않아요." });
    await expect(withDuesMember(action)).resolves.toMatchObject({ ok: false });
    expect(h.ran).toBe(0);
  });

  it("회비를 쓰는 팀이면 그대로 돌린다", async () => {
    h.duesOn = true;
    await expect(withDuesAdmin(action)).resolves.toEqual({ ok: true });
    await expect(withDuesMember(action)).resolves.toEqual({ ok: true });
    expect(h.ran).toBe(2);
  });
});
