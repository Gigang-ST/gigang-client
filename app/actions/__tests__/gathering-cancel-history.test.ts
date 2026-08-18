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
    // stt_at은 beforeEach가 매번 먼 미래로 덮는다(vi.hoisted라 여기선 dayjs를 못 쓴다).
    gthr: { data: { max_prt_cnt: null, stt_at: "", end_at: null } },
    existing: { data: { attd_id: "attd-1" } },
    verify: { data: { gthr_id: "gthr-1" } },
    selfMember: { id: "mem-self", admin: false, status: "active" },
    adminMember: { id: "admin-1", admin: true, status: "active" },
  };

  return { rpc, queryStub, cfg };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// 액션은 뒷일(모임장 알림·칭호 평가)을 `after()`로 응답 밖에 넘긴다. 요청 스코프가 없는
// 단위 테스트에서 진짜 `after`는 던지므로, 콜백을 그 자리에서 실행하는 스텁으로 바꾼다.
// 콜백 본문의 Promise.all 배열은 동기적으로 만들어지므로 insertNoti 호출은 즉시 일어난다.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn(); } }));
vi.mock("@/lib/past-event", () => ({ isPastLockedFor: () => false }));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: "team-1" }),
}));
vi.mock("@/lib/gathering/join-gathering", () => ({
  joinGatheringWithCapCheck: async () => ({ joined: true }),
}));
// toggle-attendance.ts가 취소 성공 후 모임장 알림을 위해 import한다(SG-05) — 이 테스트는 알림 발송
// 자체를 검증 대상으로 하지 않으므로 no-op으로 스텁(실제 발송 검증은 gathering-cancel-notify.test.ts).
// 실제 insertNoti는 async — 호출부가 .catch()를 물리므로 모킹도 Promise를 돌려준다.
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNoti: vi.fn(async () => {}) }));
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
import { dayjs } from "@/lib/dayjs";

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ error: null });
  // 시작 5시간 전부터는 취소에 사유가 필수다(isCancelReasonRequired). 픽스처에 날짜를 박아 두면
  // 그날이 오는 순간 "사유 없이 취소" 케이스가 통째로 깨진다 — 실제로 2026-08-01에 그렇게 됐다.
  // 시각이 검증 대상이 아닌 테스트이므로 매번 사유가 필요 없는 먼 미래로 잡는다.
  h.cfg.gthr.data.stt_at = dayjs().add(30, "day").toISOString();
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
