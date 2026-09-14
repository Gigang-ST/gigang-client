import { beforeEach, describe, expect, it, vi } from "vitest";

// 대기열 3상태 토글과 승급 알림을 검증한다.
// vi.mock 패턴은 gathering-cancel-notify.test.ts 를 따른다.

const h = vi.hoisted(() => {
  const rpc = vi.fn();
  // 실제 insertNoti는 async — 호출부가 .catch()를 물리므로 모킹도 Promise를 돌려준다.
  const insertNoti = vi.fn(async () => {});
  const evaluateAndGrantTitles = vi.fn(async () => {});
  const join = vi.fn(async () => ({ joined: true, waiting: false }));
  const waitUpdate = vi.fn();

  const queryStub = (result: unknown) => {
    const p = Promise.resolve(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy: any = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "catch") return p.catch.bind(p);
        if (prop === "finally") return p.finally.bind(p);
        if (prop === "update")
          return (...args: unknown[]) => {
            waitUpdate(...args);
            return proxy;
          };
        return () => proxy;
      },
      apply: () => proxy,
    });
    return proxy;
  };

  const cfg = {
    gthr: {
      data: {
        max_prt_cnt: 20,
        // beforeEach가 매번 먼 미래로 덮는다(vi.hoisted라 여기선 dayjs를 못 쓴다).
        stt_at: "",
        end_at: null as string | null,
        gthr_nm: "양재천 저녁런",
        crt_by: "mem-organizer",
        aprv_req_yn: false,
        req_attd_cnt: null as number | null,
        req_attd_months: null as number | null,
      },
    },
    /** 내 gthr_attd_rel 행 — null 이면 미참석 */
    existing: { data: null as { attd_id: string } | null },
    /** 내 gthr_wait_rel(waiting) 행 — null 이면 미대기 */
    myWait: { data: null as { wait_id: string } | null },
    /** 이 모임의 waiting 명단 */
    waitlist: { data: [] as { mem_id: string; wait_at: string }[] },
    /** 승급자 team_mem_rel 조회 결과 */
    rels: { data: [] as { team_mem_id: string }[] },
    selfMember: {
      id: "mem-self",
      admin: false,
      status: "active",
      full_name: "홍길동",
      team_mem_id: "tm-self",
    },
  };

  /** gthr_wait_rel 이 몇 번째로 불렸는지 — 내 대기 행 조회와 명단 조회를 가른다. */
  const waitCalls = { n: 0 };

  /** 선착순 구간 빈 자리 알림 — 코어는 seat-notice.test.ts 가 따로 검증한다. */
  const notifyOpenSeat = vi.fn(async () => [] as string[]);

  return {
    rpc,
    insertNoti,
    evaluateAndGrantTitles,
    join,
    waitUpdate,
    waitCalls,
    queryStub,
    cfg,
    notifyOpenSeat,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
// 액션은 뒷일(알림·칭호)을 `after()`로 응답 밖에 넘긴다. 요청 스코프가 없는 단위
// 테스트에서 진짜 `after`는 던지므로, 콜백을 그 자리에서 실행하는 스텁으로 바꾼다.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn(); } }));
vi.mock("@/lib/past-event", () => ({ isPastLockedFor: () => false }));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: "team-1" }),
}));
vi.mock("@/lib/gathering/join-gathering", () => ({ joinGatheringWithCapCheck: h.join }));
vi.mock("@/lib/gathering/join-condition", () => ({
  evaluateJoinConditions: async () => ({ ok: true }),
  joinConditionErrorMessage: () => "조건 미달",
}));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNoti: h.insertNoti }));
vi.mock("@/lib/gathering/seat-notice", () => ({ notifyOpenSeat: h.notifyOpenSeat }));
vi.mock("@/lib/titles/engine", () => ({ evaluateAndGrantTitles: h.evaluateAndGrantTitles }));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withActive: async (fn: any) =>
    fn({
      member: h.cfg.selfMember,
      supabase: { from: () => h.queryStub(h.cfg.existing) },
    }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({
    from: (t: string) => {
      // 액션이 admin 으로 읽는 테이블은 셋이다: gthr_mst(모임) · gthr_wait_rel · team_mem_rel.
      // gthr_wait_rel 은 **두 번** 불린다 — ① 상태 판정용 내 대기 행(Promise.all 안),
      // ② 대기로 들어간 뒤 순번 계산용 명단. 호출 순서로 가른다.
      if (t === "gthr_wait_rel") {
        h.waitCalls.n += 1;
        return h.queryStub(h.waitCalls.n === 1 ? h.cfg.myWait : h.cfg.waitlist);
      }
      if (t === "team_mem_rel") return h.queryStub(h.cfg.rels);
      return h.queryStub(h.cfg.gthr);
    },
    rpc: h.rpc,
  }),
}));

import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";
import { dayjs } from "@/lib/dayjs";

/** 취소 사유가 필요 없는 먼 미래 */
const farFutureStart = () => dayjs().add(30, "day").toISOString();

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: [], error: null });
  h.insertNoti.mockReset();
  h.evaluateAndGrantTitles.mockReset();
  h.waitUpdate.mockReset();
  h.join.mockReset();
  h.join.mockResolvedValue({ joined: true, waiting: false });
  h.cfg.gthr.data.stt_at = farFutureStart();
  h.cfg.gthr.data.crt_by = "mem-organizer";
  h.cfg.gthr.data.aprv_req_yn = false;
  h.cfg.existing.data = null;
  h.cfg.myWait.data = null;
  h.cfg.waitlist.data = [];
  h.cfg.rels.data = [];
  h.waitCalls.n = 0;
  h.notifyOpenSeat.mockReset();
  h.notifyOpenSeat.mockResolvedValue([]);
});

describe("toggleGatheringAttendance — 3상태", () => {
  it("자리가 있으면 attending 을 돌려준다", async () => {
    const r = await toggleGatheringAttendance("gthr-1");

    expect(r.state).toBe("attending");
  });

  it("정원이 차면 waiting 과 내 순번·총 대기 인원을 돌려준다", async () => {
    h.join.mockResolvedValue({ joined: false, waiting: true });
    h.cfg.waitlist.data = [
      { mem_id: "mem-a", wait_at: "2026-09-10T01:00:00Z" },
      { mem_id: "mem-self", wait_at: "2026-09-10T02:00:00Z" },
    ];

    const r = await toggleGatheringAttendance("gthr-1");

    expect(r.state).toBe("waiting");
    expect(r.waitRank).toBe(2);
    expect(r.waitCount).toBe(2);
  });

  it("순번은 wait_at 순이다 — 조회 순서가 뒤섞여 와도 맨 앞이 1번", async () => {
    h.join.mockResolvedValue({ joined: false, waiting: true });
    h.cfg.waitlist.data = [
      { mem_id: "mem-b", wait_at: "2026-09-10T05:00:00Z" },
      { mem_id: "mem-self", wait_at: "2026-09-10T01:00:00Z" },
    ];

    const r = await toggleGatheringAttendance("gthr-1");

    expect(r.waitRank).toBe(1);
  });

  it("대기 중에 누르면 대기가 취소되고 none 이 된다 — 참석 취소 RPC 를 부르지 않는다", async () => {
    h.cfg.myWait.data = { wait_id: "w-1" };

    const r = await toggleGatheringAttendance("gthr-1");

    expect(r.state).toBe("none");
    expect(h.rpc).not.toHaveBeenCalled();
    // 대기 행을 canceled 로 닫는다
    expect(h.waitUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ wait_st_cd: "canceled" }),
    );
  });

  it("대기 취소는 임박이어도 사유를 요구하지 않는다(자리를 갖고 있던 게 아니다)", async () => {
    h.cfg.myWait.data = { wait_id: "w-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString(); // 임박(5시간 이내)

    const r = await toggleGatheringAttendance("gthr-1");

    expect(r.state).toBe("none");
  });

  it("대기 취소는 모임장에게 알림을 보내지 않는다 — 참석 취소가 아니다", async () => {
    h.cfg.myWait.data = { wait_id: "w-1" };

    await toggleGatheringAttendance("gthr-1");

    expect(h.insertNoti).not.toHaveBeenCalled();
  });
});

describe("toggleGatheringAttendance — 승급 알림", () => {
  beforeEach(() => {
    h.cfg.existing.data = { attd_id: "attd-1" }; // 나는 참석 중 → 취소 분기
  });

  it("취소로 자리가 나서 승급자가 생기면 그 사람에게 gthr_promo 알림을 보낸다", async () => {
    h.rpc.mockResolvedValue({ data: ["mem-promoted"], error: null });

    await toggleGatheringAttendance("gthr-1", "몸살");

    expect(h.insertNoti).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        memId: "mem-promoted",
        notiTypeEnm: "gthr_promo",
        refId: "gthr-1",
        refTypeEnm: "gathering",
      }),
    );
  });

  it("승급자가 여러 명이면 각자에게 보낸다", async () => {
    h.rpc.mockResolvedValue({ data: ["mem-a", "mem-b"], error: null });

    await toggleGatheringAttendance("gthr-1", "몸살");

    const promoCalls = h.insertNoti.mock.calls.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any[]) => c[0]?.notiTypeEnm === "gthr_promo",
    );
    expect(promoCalls).toHaveLength(2);
  });

  it("승급자가 없으면(정원 초과 상태라 자리가 안 남) gthr_promo 알림을 보내지 않는다", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });

    await toggleGatheringAttendance("gthr-1", "몸살");

    expect(h.insertNoti).not.toHaveBeenCalledWith(
      expect.objectContaining({ notiTypeEnm: "gthr_promo" }),
    );
  });

  it("승급자에게도 참석 칭호(gathering_attend)를 평가한다 — 막차를 못 받으면 안 된다", async () => {
    h.rpc.mockResolvedValue({ data: ["mem-promoted"], error: null });
    h.cfg.rels.data = [{ team_mem_id: "tm-promoted" }];

    await toggleGatheringAttendance("gthr-1", "몸살");

    expect(h.evaluateAndGrantTitles).toHaveBeenCalledWith({
      trigger: "gathering_attend",
      teamId: "team-1",
      teamMemId: "tm-promoted",
    });
  });

  it("승급 알림이 실패해도 취소 자체는 성공이다", async () => {
    h.rpc.mockResolvedValue({ data: ["mem-promoted"], error: null });
    h.insertNoti.mockRejectedValue(new Error("push down"));

    const r = await toggleGatheringAttendance("gthr-1", "부상");

    expect(r.state).toBe("none");
  });
});

describe("선착순 구간 취소 — 승급 대신 빈 자리 알림", () => {
  it("RPC 가 빈 자리 알림을 지시하면 대기자에게 보낸다", async () => {
    h.cfg.existing.data = { attd_id: "attd-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();
    // 선착순 구간 게이트에 걸려 승급자는 없고, 실제로 자리가 비었다.
    h.rpc.mockResolvedValue({ data: { promoted: [], notify_open_seat: true }, error: null });

    await toggleGatheringAttendance("gthr-1", "개인 사정");

    expect(h.notifyOpenSeat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ gthrId: "gthr-1", teamId: "team-1" }),
    );
  });

  // 22/20 케이스(#530의 발단): 선착순 구간이어도 취소 뒤 21/20 이면 자리가 없다.
  // 앱이 시각만 보고 보내면 가짜 알림이 나가고, 1회 제한 때문에 진짜 빈자리 알림이 막힌다.
  it("선착순 구간이어도 RPC 가 빈자리 없음으로 판정하면 보내지 않는다 — 정원 초과 모임", async () => {
    h.cfg.existing.data = { attd_id: "attd-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();
    h.rpc.mockResolvedValue({ data: { promoted: [], notify_open_seat: false }, error: null });

    await toggleGatheringAttendance("gthr-1", "개인 사정");

    expect(h.notifyOpenSeat).not.toHaveBeenCalled();
  });

  // 두 경계 사이(2~5시간): 취소 사유는 필수지만 대기 순번은 아직 살아 있다.
  // 여기서 빈 자리 알림이 나가면 자동 승급과 이중으로 알리는 꼴이 된다.
  //
  // ⚠️ "정확히 5시간"으로 잡지 않는다 — 액션이 도는 몇 ms 사이에 5시간 미만이 되어
  //    사유 필수에 걸리고, 통과 여부가 밀리초로 갈리는 플레이키가 된다(실제로 겪었다).
  it("시작 3시간 전 취소면 보내지 않는다 — 자동 승급이 도는 구간이다", async () => {
    h.cfg.existing.data = { attd_id: "attd-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(3, "hour").toISOString();
    h.rpc.mockResolvedValue({ data: ["mem-next"], error: null });

    await toggleGatheringAttendance("gthr-1", "개인 사정");

    expect(h.notifyOpenSeat).not.toHaveBeenCalled();
    // 대신 승급자에게는 확정 알림이 나간다.
    expect(h.insertNoti).toHaveBeenCalledWith(
      expect.objectContaining({ notiTypeEnm: "gthr_promo", memId: "mem-next" }),
    );
  });

  it("먼 미래 모임 취소도 보내지 않는다", async () => {
    h.cfg.existing.data = { attd_id: "attd-1" };

    await toggleGatheringAttendance("gthr-1");

    expect(h.notifyOpenSeat).not.toHaveBeenCalled();
  });

  it("대기 취소(참석 아님)는 자리가 나는 사건이 아니라 알림이 없다", async () => {
    h.cfg.existing.data = null;
    h.cfg.myWait.data = { wait_id: "w-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();

    const r = await toggleGatheringAttendance("gthr-1");

    expect(r.state).toBe("none");
    expect(h.notifyOpenSeat).not.toHaveBeenCalled();
  });
});

// PR #532 리뷰: 선착순 구간의 대기자는 버튼이 "참석하기"인데, 토글이 대기 행을 보면 무조건
// 대기 취소로 가서 참석할 방법이 없었다. 의도("join")를 받아 참석 등록 경로로 보낸다.
describe("선착순 구간 대기자의 직접 참석 — intent: join", () => {
  it("대기 중인 사람이 join 으로 누르면 대기 취소가 아니라 참석 등록으로 간다", async () => {
    h.cfg.myWait.data = { wait_id: "w-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();

    const r = await toggleGatheringAttendance("gthr-1", undefined, "join");

    expect(r.state).toBe("attending");
    expect(h.join).toHaveBeenCalled();
    expect(h.waitUpdate).not.toHaveBeenCalled();
  });

  it("누르는 사이 자리가 찼으면 대기가 순번 그대로 유지된다", async () => {
    h.cfg.myWait.data = { wait_id: "w-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();
    h.join.mockResolvedValue({ joined: false, waiting: true });
    h.cfg.waitlist.data = [{ mem_id: "mem-self", wait_at: "2026-09-10T01:00:00Z" }];

    const r = await toggleGatheringAttendance("gthr-1", undefined, "join");

    expect(r.state).toBe("waiting");
    expect(r.waitRank).toBe(1);
    expect(h.waitUpdate).not.toHaveBeenCalled();
  });

  it("선착순 구간 전에는 거절한다 — 대기자가 직접 들어오면 앞 순번을 제친다", async () => {
    h.cfg.myWait.data = { wait_id: "w-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(3, "hour").toISOString();

    await expect(toggleGatheringAttendance("gthr-1", undefined, "join")).rejects.toThrow();
    expect(h.join).not.toHaveBeenCalled();
    expect(h.waitUpdate).not.toHaveBeenCalled();
  });

  it("intent 없이 누르면 기존대로 대기 취소다", async () => {
    h.cfg.myWait.data = { wait_id: "w-1" };
    h.cfg.gthr.data.stt_at = dayjs().add(1, "hour").toISOString();

    const r = await toggleGatheringAttendance("gthr-1");

    expect(r.state).toBe("none");
    expect(h.join).not.toHaveBeenCalled();
  });
});
