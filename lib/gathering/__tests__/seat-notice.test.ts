import { beforeEach, describe, expect, it, vi } from "vitest";

// 선착순 구간(시작 2시간 전~) 빈 자리 알림. 대기자 전원에게, 모임당 1회.

const h = vi.hoisted(() => ({
  insertNotiMany: vi.fn(async () => ({ inAppOk: true, notifiedMemIds: [] as string[] })),
  waiting: { data: [] as { mem_id: string }[] },
  alreadySent: { data: [] as { mem_id: string }[] },
}));

// join-gathering.test.ts 와 같은 이유 — "server-only"는 vitest 에서 해석되지 않는다.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNotiMany: h.insertNotiMany }));

/**
 * from("gthr_wait_rel") → 대기 명단, from("noti_mst") → 이미 보낸 사람.
 * 체이닝(.select().eq()...)을 전부 흡수하고 await 시 결과를 돌려주는 최소 스텁.
 */
const admin = {
  from(table: string) {
    const result = table === "gthr_wait_rel" ? h.waiting : h.alreadySent;
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
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

import { notifyOpenSeat } from "@/lib/gathering/seat-notice";

const ARGS = { gthrId: "g1", gthrNm: "수요 한강런", teamId: "t1" };

describe("notifyOpenSeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.waiting.data = [];
    h.alreadySent.data = [];
  });

  it("대기자 전원에게 보낸다", async () => {
    h.waiting.data = [{ mem_id: "m1" }, { mem_id: "m2" }];

    const sent = await notifyOpenSeat(admin, ARGS);

    expect(sent).toEqual(["m1", "m2"]);
    expect(h.insertNotiMany).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "t1",
        memIds: ["m1", "m2"],
        notiTypeEnm: "gthr_seat",
        refId: "g1",
        refTypeEnm: "gathering",
      }),
    );
  });

  it("문구는 시각을 약속하지 않는다 — 알림은 한 번 나가면 고쳐지지 않는다", async () => {
    h.waiting.data = [{ mem_id: "m1" }];

    await notifyOpenSeat(admin, ARGS);

    const arg = h.insertNotiMany.mock.calls[0][0] as unknown as {
      notiNm: string;
      notiCont: string;
    };
    expect(arg.notiNm).toBe("'수요 한강런' 빈 자리가 났어요");
    expect(arg.notiCont).toBe("지금은 순번 없이 먼저 누르는 분이 참석하실 수 있어요.");
    // "몇 시부터"를 적으면 그 사이 자리가 차서 거짓말이 된다.
    expect(arg.notiCont).not.toMatch(/시\s*\d|\d+\s*분\s*(뒤|후)/);
  });

  it("이미 받은 사람은 제외한다 — 당일 취소가 서너 건이라 도배된다", async () => {
    h.waiting.data = [{ mem_id: "m1" }, { mem_id: "m2" }];
    h.alreadySent.data = [{ mem_id: "m1" }];

    const sent = await notifyOpenSeat(admin, ARGS);

    expect(sent).toEqual(["m2"]);
    expect(h.insertNotiMany).toHaveBeenCalledWith(
      expect.objectContaining({ memIds: ["m2"] }),
    );
  });

  it("보낼 사람이 남지 않으면 알림을 부르지 않는다", async () => {
    h.waiting.data = [{ mem_id: "m1" }];
    h.alreadySent.data = [{ mem_id: "m1" }];

    const sent = await notifyOpenSeat(admin, ARGS);

    expect(sent).toEqual([]);
    expect(h.insertNotiMany).not.toHaveBeenCalled();
  });

  it("대기자가 없으면 조용히 끝난다 — noti_mst 를 뒤지지도 않는다", async () => {
    const sent = await notifyOpenSeat(admin, ARGS);

    expect(sent).toEqual([]);
    expect(h.insertNotiMany).not.toHaveBeenCalled();
  });
});
