import { beforeEach, describe, expect, it, vi } from "vitest";

// 참가자 취소 시 벙주(개설자)에게 알림이 가는지 검증(SG-05).
// - AC-14: 본인 취소 시 벙주에게 신규 알림 타입(gthr_cncl)으로 insertNoti 발송
// - AC-15: 벙주 본인이 자기 모임을 취소한 경우엔 자기 자신에게 발송하지 않음
// vi.mock 패턴은 gathering-cancel-history.test.ts 를 따른다.

const h = vi.hoisted(() => {
  const rpc = vi.fn();
  const insertNoti = vi.fn();

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
    gthr: {
      data: {
        max_prt_cnt: null,
        stt_at: "2026-08-01T10:00:00Z",
        end_at: null as string | null,
        gthr_nm: "양재천 저녁런",
        crt_by: "mem-organizer",
      },
    },
    existing: { data: { attd_id: "attd-1" } },
    selfMember: { id: "mem-self", admin: false, status: "active", full_name: "홍길동" },
  };

  return { rpc, insertNoti, queryStub, cfg };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/past-event", () => ({ isPastLockedFor: () => false }));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: "team-1" }),
}));
vi.mock("@/lib/gathering/join-gathering", () => ({
  joinGatheringWithCapCheck: async () => ({ joined: true }),
}));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNoti: h.insertNoti }));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withActive: async (fn: any) =>
    fn({ member: h.cfg.selfMember, supabase: { from: () => h.queryStub(h.cfg.existing) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({ from: () => h.queryStub(h.cfg.gthr), rpc: h.rpc }),
}));

import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ error: null });
  h.insertNoti.mockReset();
  h.cfg.gthr.data.crt_by = "mem-organizer";
});

describe("toggleGatheringAttendance — 참가자 취소 시 벙주 알림", () => {
  it("AC-14: 본인 취소 시 벙주에게 gthr_cncl 타입으로 인앱+푸시 알림을 발송한다(수신거부는 gthr_upd로 판단)", async () => {
    const result = await toggleGatheringAttendance("gthr-1", "몸살이 나서 못 갈 것 같아요");

    expect(result).toEqual({ attending: false });
    expect(h.insertNoti).toHaveBeenCalledTimes(1);
    expect(h.insertNoti).toHaveBeenCalledWith({
      teamId: "team-1",
      memId: "mem-organizer",
      notiTypeEnm: "gthr_cncl",
      prefTypeEnm: "gthr_upd",
      notiNm: "홍길동님이 '양재천 저녁런' 참석을 취소했어요",
      notiCont: "사유: 몸살이 나서 못 갈 것 같아요",
      refId: "gthr-1",
      refTypeEnm: "gathering",
    });
  });

  it("AC-14: 사유 없이 취소하면 notiCont는 null이다", async () => {
    h.cfg.gthr.data.stt_at = "2026-08-01T10:00:00Z";
    await toggleGatheringAttendance("gthr-1");

    expect(h.insertNoti).toHaveBeenCalledWith(
      expect.objectContaining({ notiCont: null }),
    );
  });

  it("AC-15: 벙주 본인이 자기 모임을 취소하면 자기 자신에게 알림을 보내지 않는다", async () => {
    h.cfg.gthr.data.crt_by = "mem-self"; // 개설자 = 취소하는 본인

    const result = await toggleGatheringAttendance("gthr-1", "일정 변경");

    expect(result).toEqual({ attending: false });
    expect(h.insertNoti).not.toHaveBeenCalled();
  });

  it("알림 발송(insertNoti)이 실패해도 취소 자체는 성공으로 처리한다", async () => {
    h.insertNoti.mockRejectedValue(new Error("push down"));

    const result = await toggleGatheringAttendance("gthr-1", "부상");

    expect(result).toEqual({ attending: false });
  });
});
