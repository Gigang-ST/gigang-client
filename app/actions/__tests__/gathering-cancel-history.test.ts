import { beforeEach, describe, expect, it, vi } from "vitest";

// 취소 이력(gthr_attd_hist) 배선 검증:
// 본인/관리자 두 취소 경로가 모두 cancel_gthr_attendance RPC 를 올바른 actor 구분·사유로
// 호출하는지 확인한다. 실제 원자성/RLS/재참석은 dev DB SQL 로 별도 검증(AC-03/04).

const h = vi.hoisted(() => {
  const rpc = vi.fn();

  // Supabase 쿼리 빌더 스텁: 어떤 체이닝 메서드도 자기 자신을 반환하고, await 시 result 로 resolve.
  const queryStub = (result: unknown) => {
    const p = Promise.resolve(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy: any = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "catch") return p.catch.bind(p);
        if (prop === "finally") return p.finally.bind(p);
        return () => proxy;
      },
      apply: () => proxy,
    });
    return proxy;
  };

  const cfg = {
    gthr: { data: { max_prt_cnt: null, stt_at: "2026-08-01T10:00:00Z", end_at: null } },
    existing: { data: { attd_id: "attd-1" } },
    verify: { data: { gthr_id: "gthr-1" } },
    selfMember: { id: "mem-self", admin: false, status: "active" },
    adminMember: { id: "admin-1", admin: true, status: "active" },
  };

  return { rpc, queryStub, cfg };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/past-event", () => ({ isPastLockedFor: () => false }));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: "team-1" }),
}));
vi.mock("@/lib/gathering/join-gathering", () => ({
  joinGatheringWithCapCheck: async () => ({ joined: true }),
}));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withActive: async (fn: any) =>
    fn({ member: h.cfg.selfMember, supabase: { from: () => h.queryStub(h.cfg.existing) } }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdmin: async (fn: any) =>
    fn({ member: h.cfg.adminMember, supabase: { from: () => h.queryStub(h.cfg.existing) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({ from: () => h.queryStub(h.cfg.gthr), rpc: h.rpc }),
  createAdminClient: () => ({ from: () => h.queryStub(h.cfg.verify), rpc: h.rpc }),
}));

import { removeGatheringAttendance } from "@/app/actions/admin/manage-gathering-attendance";
import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ error: null });
});

describe("본인 참석 취소 (toggleGatheringAttendance)", () => {
  it("취소 시 cancel_gthr_attendance RPC 를 actor_kind='self' + 사유로 호출한다", async () => {
    const result = await toggleGatheringAttendance("gthr-1", "부상으로 불참");

    expect(result).toEqual({ attending: false });
    expect(h.rpc).toHaveBeenCalledWith("cancel_gthr_attendance", {
      p_gthr_id: "gthr-1",
      p_mem_id: "mem-self",
      p_actor_kind: "self",
      p_actor_mem_id: "mem-self",
      p_reason: "부상으로 불참",
    });
  });

  it("사유 미지정 시 p_reason 은 null 로 전달된다", async () => {
    await toggleGatheringAttendance("gthr-1");

    expect(h.rpc).toHaveBeenCalledWith(
      "cancel_gthr_attendance",
      expect.objectContaining({ p_actor_kind: "self", p_reason: null }),
    );
  });

  it("RPC 실패 시 참석 취소 에러를 던진다", async () => {
    h.rpc.mockResolvedValue({ error: { message: "boom" } });
    await expect(toggleGatheringAttendance("gthr-1")).rejects.toThrow("참석 취소에 실패했습니다.");
  });
});

describe("관리자 참석 취소 (removeGatheringAttendance)", () => {
  it("취소 시 cancel_gthr_attendance RPC 를 actor_kind='admin' + 관리자 mem_id 로 호출한다", async () => {
    const result = await removeGatheringAttendance("gthr-1", "mem-2", "노쇼 처리");

    expect(result).toEqual({ ok: true, message: null });
    expect(h.rpc).toHaveBeenCalledWith("cancel_gthr_attendance", {
      p_gthr_id: "gthr-1",
      p_mem_id: "mem-2",
      p_actor_kind: "admin",
      p_actor_mem_id: "admin-1",
      p_reason: "노쇼 처리",
    });
  });

  it("RPC 실패 시 ok:false 를 반환한다", async () => {
    h.rpc.mockResolvedValue({ error: { message: "boom" } });
    const result = await removeGatheringAttendance("gthr-1", "mem-2");
    expect(result).toEqual({ ok: false, message: "참석 취소에 실패했습니다" });
  });
});
