import { beforeEach, describe, expect, it, vi } from "vitest";

import { GATHERING_CANCEL_IMMINENT_HOURS } from "@/lib/gathering/cancel-imminent";

// 임박 취소(모임 시작 GATHERING_CANCEL_IMMINENT_HOURS 시간 전부터) 사유 필수 서버 강제 검증(SG-02).
// 클라이언트 모달을 우회해 reason 없이 호출해도 서버가 거부하는지가 핵심 — 클라이언트를 신뢰하지 않는다.
// vi.mock 패턴은 gathering-cancel-history.test.ts 를 따른다.

const h = vi.hoisted(() => {
  const rpc = vi.fn();

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

  // 매 테스트에서 stt_at 을 바꿔치기할 수 있도록 mutable 객체로 보관.
  const cfg = {
    gthr: { data: { max_prt_cnt: null, stt_at: "" as string, end_at: null as string | null } },
    existing: { data: { attd_id: "attd-1" } },
    selfMember: { id: "mem-self", admin: false, status: "active" },
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
}));
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({ from: () => h.queryStub(h.cfg.gthr), rpc: h.rpc }),
}));

import { dayjs } from "@/lib/dayjs";

import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ error: null });
});

describe("toggleGatheringAttendance — 임박 취소 사유 필수 서버 강제", () => {
  it("AC-05: 시작이 5시간 이내로 임박했는데 사유가 빈 값이면 RPC 호출 없이 거부한다", async () => {
    h.cfg.gthr.data.stt_at = dayjs().add(2, "hour").toISOString();

    await expect(toggleGatheringAttendance("gthr-1")).rejects.toThrow(
      "시작 5시간 전부터는 취소 사유가 필요해요.",
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("AC-05: 임박 취소에 공백만 있는 사유를 보내도 거부한다(trim 후 빈 값 취급)", async () => {
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();

    await expect(toggleGatheringAttendance("gthr-1", "   ")).rejects.toThrow(
      "시작 5시간 전부터는 취소 사유가 필요해요.",
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("AC-05: 임박 취소라도 사유가 있으면 RPC 를 호출한다", async () => {
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();

    const result = await toggleGatheringAttendance("gthr-1", "몸살이 나서 못 갈 것 같아요");

    expect(result).toEqual({ attending: false });
    expect(h.rpc).toHaveBeenCalledWith(
      "cancel_gthr_attendance",
      expect.objectContaining({ p_reason: "몸살이 나서 못 갈 것 같아요" }),
    );
  });

  it(`AC-06: 시작까지 ${GATHERING_CANCEL_IMMINENT_HOURS}시간보다 많이 남았으면 사유 없이도 취소된다`, async () => {
    h.cfg.gthr.data.stt_at = dayjs().add(10, "hour").toISOString();

    const result = await toggleGatheringAttendance("gthr-1");

    expect(result).toEqual({ attending: false });
    expect(h.rpc).toHaveBeenCalledWith(
      "cancel_gthr_attendance",
      expect.objectContaining({ p_reason: null }),
    );
  });
});
