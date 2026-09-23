import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 액션 관문이 **회원 상태로** 무엇을 막는지 못박는다.
 *
 * 눈으로는 못 지키는 종류다 — 탈퇴 회원은 화면상 아무 데도 없지만 세션은 살아 있고
 * (`setMemberLeft` 가 auth 세션을 끊지 않는다), `fetchMemMstWithTeamRel` 은 `mem_st_cd` 를
 * 안 보므로 `member` 객체가 멀쩡히 나온다. 관문이 상태를 안 보면 탈퇴자가 그대로 통과한다.
 * 실제로 러닝 프로필·가까운 역 수정이 그 경로로 열려 있었고(2026-09-23, prd 탈퇴 116명),
 * 그 액션들은 service role 로 써서 RLS 백스톱조차 없었다.
 *
 * 관문이 넷이라 표로 굳힌다 — 어느 하나를 고칠 때 나머지와 어긋나면 여기서 깨진다.
 */

const h = vi.hoisted(() => ({
  member: null as
    | { id: string; status: string; admin: boolean; inact_rsn_txt: string | null }
    | null,
}));

vi.mock("@/lib/queries/member", () => ({
  getCurrentMember: async () => ({
    user: h.member ? { id: h.member.id } : null,
    member: h.member,
    supabase: {},
  }),
}));

import {
  withActive,
  withAdmin,
  withAdminOrThrow,
  withMember,
  withMemberAnyStatus,
} from "@/lib/actions/auth";

const setMember = (status: string, admin = false) => {
  h.member = { id: "mem-1", status, admin, inact_rsn_txt: null };
};

beforeEach(() => {
  h.member = null;
});

/** 관문을 통과해 본문이 실제로 돌았는지. throw 는 전부 "막혔다"로 본다. */
const ran = async (guard: (fn: () => Promise<string>) => Promise<unknown>) => {
  try {
    return (await guard(async () => "ran")) === "ran";
  } catch {
    return false;
  }
};

describe("withMember — 탈퇴는 막고 비활성은 통과시킨다", () => {
  it.each([
    ["active", true],
    ["inactive", true],
    ["left", false],
  ])("status=%s → 통과=%s", async (status, expected) => {
    setMember(status);
    expect(await ran(withMember)).toBe(expected);
  });

  it("비로그인·미가입(member=null)은 막는다", async () => {
    h.member = null;
    expect(await ran(withMember)).toBe(false);
  });

  it("탈퇴를 막을 때도 문구를 싣는다 — 안내 다이얼로그가 없는 자리가 많다", async () => {
    setMember("left");
    await expect(withMember(async () => "ran")).rejects.toThrow(/회원/);
  });
});

describe("withMemberAnyStatus — 복귀 요청 전용, 상태를 보지 않는다", () => {
  it.each(["active", "inactive", "left"])("status=%s 는 통과한다", async (status) => {
    setMember(status);
    expect(await ran(withMemberAnyStatus)).toBe(true);
  });

  it("그래도 비로그인은 막는다", async () => {
    h.member = null;
    expect(await ran(withMemberAnyStatus)).toBe(false);
  });
});

describe("withActive — active 만", () => {
  it.each([
    ["active", true],
    ["inactive", false],
    ["left", false],
  ])("status=%s → 통과=%s", async (status, expected) => {
    setMember(status);
    expect(await ran(withActive)).toBe(expected);
  });
});

describe("관리자 관문 — 권한은 활동 중일 때만 산다", () => {
  /**
   * `member.admin` 은 `team_role_cd` 만 보므로 탈퇴·비활성 관리자가 남으면 그대로 통과한다.
   * `setMemberLeft` 가 owner 만 제외하니 탈퇴한 admin 은 실제로 생길 수 있다.
   */
  it.each([
    ["active", true],
    ["inactive", false],
    ["left", false],
  ])("admin 이어도 status=%s → 통과=%s", async (status, expected) => {
    setMember(status, true);
    expect(await ran(withAdminOrThrow)).toBe(expected);
    expect((await withAdmin(async () => ({ ok: true as const }))).ok).toBe(expected);
  });

  it("active 여도 admin 이 아니면 막는다", async () => {
    setMember("active", false);
    expect(await ran(withAdminOrThrow)).toBe(false);
    expect((await withAdmin(async () => ({ ok: true as const }))).ok).toBe(false);
  });
});
