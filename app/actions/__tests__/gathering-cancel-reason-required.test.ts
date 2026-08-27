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

// updateTag: 참석 토글이 홈 캘린더 캐시를 즉시 턴다(로컬·SWR 에서 "만든 모임이 안 보임" 방지).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
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
