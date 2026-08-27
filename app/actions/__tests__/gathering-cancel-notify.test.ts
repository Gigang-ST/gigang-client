import { beforeEach, describe, expect, it, vi } from "vitest";

// 참가자 취소 시 모임장(개설자)에게 알림이 가는지 검증(SG-05).
// - AC-14: 본인 취소 시 모임장에게 신규 알림 타입(gthr_cncl)으로 insertNoti 발송
// - AC-15: 모임장 본인이 자기 모임을 취소한 경우엔 자기 자신에게 발송하지 않음
// vi.mock 패턴은 gathering-cancel-history.test.ts 를 따른다.

const h = vi.hoisted(() => {
  const rpc = vi.fn();
  // 실제 insertNoti는 async — 호출부가 .catch()를 물리므로 모킹도 Promise를 돌려준다.
  // (vi.fn(impl)은 mockReset 후에도 이 구현으로 복원된다)
  const insertNoti = vi.fn(async () => {});

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
        // beforeEach가 매번 먼 미래로 덮는다(vi.hoisted라 여기선 dayjs를 못 쓴다).
        stt_at: "",
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
import { dayjs } from "@/lib/dayjs";

/** 취소 사유가 필요 없는 먼 미래(§gathering-cancel-history.test.ts의 같은 상수) */
const farFutureStart = () => dayjs().add(30, "day").toISOString();

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ error: null });
  h.insertNoti.mockReset();
  h.cfg.gthr.data.crt_by = "mem-organizer";
  h.cfg.gthr.data.stt_at = farFutureStart();
});

describe("toggleGatheringAttendance — 참가자 취소 시 모임장 알림", () => {
  it("AC-14: 본인 취소 시 모임장에게 gthr_cncl 타입으로 인앱+푸시 알림을 발송한다(수신거부는 gthr_cncl 자체로 판단 — 모임 수정·삭제와 별개)", async () => {
    const result = await toggleGatheringAttendance("gthr-1", "몸살이 나서 못 갈 것 같아요");

    expect(result).toEqual({ attending: false });
    expect(h.insertNoti).toHaveBeenCalledTimes(1);
    expect(h.insertNoti).toHaveBeenCalledWith({
      teamId: "team-1",
      memId: "mem-organizer",
      notiTypeEnm: "gthr_cncl",
      notiNm: "홍길동님이 '양재천 저녁런' 참석을 취소했어요",
      notiCont: "사유: 몸살이 나서 못 갈 것 같아요",
      refId: "gthr-1",
      refTypeEnm: "gathering",
    });
  });

  it("AC-14: 취소 알림은 prefTypeEnm을 지정하지 않는다(gthr_cncl 자체 수신거부 설정으로 판단)", async () => {
    await toggleGatheringAttendance("gthr-1", "사유");

    expect(h.insertNoti).toHaveBeenCalledWith(
      expect.not.objectContaining({ prefTypeEnm: expect.anything() }),
    );
  });

  it("AC-14: 사유 없이 취소하면 notiCont는 null이다", async () => {
    h.cfg.gthr.data.stt_at = farFutureStart();
    await toggleGatheringAttendance("gthr-1");

    expect(h.insertNoti).toHaveBeenCalledWith(
      expect.objectContaining({ notiCont: null }),
    );
  });

  it("AC-15: 모임장 본인이 자기 모임을 취소하면 자기 자신에게 알림을 보내지 않는다", async () => {
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
