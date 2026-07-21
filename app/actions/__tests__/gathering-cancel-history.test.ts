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
// toggle-attendance.ts가 취소 성공 후 모임장 알림을 위해 import한다(SG-05) — 이 테스트는 알림 발송
// 자체를 검증 대상으로 하지 않으므로 no-op으로 스텁(실제 발송 검증은 gathering-cancel-notify.test.ts).
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNoti: vi.fn() }));
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
  it("취소 시 cancel_gthr_attendance RPC 를 actor_cd='self' + 사유로 호출한다", async () => {
    const result = await toggleGatheringAttendance("gthr-1", "부상으로 불참");

    expect(result).toEqual({ attending: false });
    expect(h.rpc).toHaveBeenCalledWith("cancel_gthr_attendance", {
      p_gthr_id: "gthr-1",
      p_mem_id: "mem-self",
      p_actor_cd: "self",
      p_actor_mem_id: "mem-self",
      p_reason: "부상으로 불참",
    });
  });

  it("사유 미지정 시 p_reason 은 null 로 전달된다", async () => {
    await toggleGatheringAttendance("gthr-1");

    expect(h.rpc).toHaveBeenCalledWith(
      "cancel_gthr_attendance",
      expect.objectContaining({ p_actor_cd: "self", p_reason: null }),
    );
  });

  it("사유가 500자를 초과하면 RPC 호출 없이 거부한다", async () => {
    const tooLong = "가".repeat(501);
    await expect(toggleGatheringAttendance("gthr-1", tooLong)).rejects.toThrow(
      "취소 사유는 500자 이내로 입력해주세요.",
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("RPC 실패 시 참석 취소 에러를 던진다", async () => {
    h.rpc.mockResolvedValue({ error: { message: "boom" } });
    await expect(toggleGatheringAttendance("gthr-1")).rejects.toThrow("참석 취소에 실패했습니다.");
  });
});

describe("관리자 참석 취소 (removeGatheringAttendance)", () => {
  it("취소 시 cancel_gthr_attendance RPC 를 actor_cd='admin' + 관리자 mem_id 로 호출한다", async () => {
    const result = await removeGatheringAttendance("gthr-1", "mem-2", "노쇼 처리");

    expect(result).toEqual({ ok: true, message: null });
    expect(h.rpc).toHaveBeenCalledWith("cancel_gthr_attendance", {
      p_gthr_id: "gthr-1",
      p_mem_id: "mem-2",
      p_actor_cd: "admin",
      p_actor_mem_id: "admin-1",
      p_reason: "노쇼 처리",
    });
  });

  it("사유가 500자를 초과하면 RPC 호출 없이 ok:false 를 반환한다", async () => {
    const tooLong = "노".repeat(501);
    const result = await removeGatheringAttendance("gthr-1", "mem-2", tooLong);
    expect(result).toEqual({ ok: false, message: "취소 사유는 500자 이내로 입력해주세요." });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("RPC 실패 시 ok:false 를 반환한다", async () => {
    h.rpc.mockResolvedValue({ error: { message: "boom" } });
    const result = await removeGatheringAttendance("gthr-1", "mem-2");
    expect(result).toEqual({ ok: false, message: "참석 취소에 실패했습니다" });
  });
});
