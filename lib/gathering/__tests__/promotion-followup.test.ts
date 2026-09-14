import { beforeEach, describe, expect, it, vi } from "vitest";

// 대기열이 움직인 뒤처리 — 세 경로(본인 취소·운영진 제거·정원 증가)가 공유한다.

type NotiManyInput = { memIds: string[]; notiNm: string; notiTypeEnm: string };

const h = vi.hoisted(() => ({
  insertNotiMany: vi.fn(async (_input: { memIds: string[]; notiNm: string; notiTypeEnm: string }) => ({
    inAppOk: true,
    notifiedMemIds: [] as string[],
  })),
  notifyOpenSeat: vi.fn(async () => [] as string[]),
  evaluateAndGrantTitles: vi.fn(async (_input: { teamMemId: string; trigger: string }) => {}),
  rels: { data: [] as { team_mem_id: string }[], error: null as { message: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNotiMany: h.insertNotiMany }));
vi.mock("@/lib/gathering/seat-notice", () => ({ notifyOpenSeat: h.notifyOpenSeat }));
vi.mock("@/lib/titles/engine", () => ({ evaluateAndGrantTitles: h.evaluateAndGrantTitles }));

const admin = {
  from() {
    const p = Promise.resolve(h.rels);
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

import { PROMO_NOTI_BODY, runPromotionFollowups } from "@/lib/gathering/promotion-followup";

const BASE = { teamId: "t1", gthrId: "g1", gthrNm: "수요 한강런" };

describe("runPromotionFollowups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rels.data = [];
    h.rels.error = null;
  });

  it("할 일이 없으면 아무것도 부르지 않는다", async () => {
    await runPromotionFollowups(admin, { ...BASE, cause: "cancel", promoted: [], notifyOpenSeat: false });

    expect(h.insertNotiMany).not.toHaveBeenCalled();
    expect(h.notifyOpenSeat).not.toHaveBeenCalled();
    expect(h.evaluateAndGrantTitles).not.toHaveBeenCalled();
  });

  it("승급자에게 승급 알림을 보내고 칭호를 평가한다", async () => {
    h.rels.data = [{ team_mem_id: "tm1" }, { team_mem_id: "tm2" }];

    await runPromotionFollowups(admin, {
      ...BASE,
      cause: "cancel",
      promoted: ["m1", "m2"],
      notifyOpenSeat: false,
    });

    expect(h.insertNotiMany).toHaveBeenCalledWith(
      expect.objectContaining({
        memIds: ["m1", "m2"],
        notiTypeEnm: "gthr_promo",
        notiNm: "'수요 한강런' 자리가 나서 참석이 확정됐어요",
        notiCont: PROMO_NOTI_BODY,
        refId: "g1",
      }),
    );
    expect(h.evaluateAndGrantTitles).toHaveBeenCalledTimes(2);
    expect(h.evaluateAndGrantTitles).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "gathering_attend", teamMemId: "tm1" }),
    );
    expect(h.notifyOpenSeat).not.toHaveBeenCalled();
  });

  it("정원 증가로 올라가면 제목이 갈린다", async () => {
    await runPromotionFollowups(admin, {
      ...BASE,
      cause: "capacity",
      promoted: ["m1"],
      notifyOpenSeat: false,
    });

    const arg = h.insertNotiMany.mock.calls[0][0] as NotiManyInput;
    expect(arg.notiNm).toBe("'수요 한강런' 정원이 늘어 참석이 확정됐어요");
  });

  it("빈 자리 알림만 지시되면 그것만 보낸다 — 선착순 구간이라 승급자가 없다", async () => {
    await runPromotionFollowups(admin, { ...BASE, cause: "capacity", promoted: [], notifyOpenSeat: true });

    expect(h.notifyOpenSeat).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ gthrId: "g1", gthrNm: "수요 한강런", teamId: "t1" }),
    );
    expect(h.insertNotiMany).not.toHaveBeenCalled();
    expect(h.evaluateAndGrantTitles).not.toHaveBeenCalled();
  });

  it("한 단계가 실패해도 나머지는 돌고, 전체는 reject 하지 않는다", async () => {
    h.insertNotiMany.mockRejectedValueOnce(new Error("push down"));
    h.notifyOpenSeat.mockRejectedValueOnce(new Error("seat down"));
    h.rels.data = [{ team_mem_id: "tm1" }];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runPromotionFollowups(admin, { ...BASE, cause: "cancel", promoted: ["m1"], notifyOpenSeat: true }),
    ).resolves.toBeUndefined();

    expect(h.evaluateAndGrantTitles).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("승급자 조회가 실패해도 reject 하지 않는다", async () => {
    h.rels.error = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runPromotionFollowups(admin, { ...BASE, cause: "cancel", promoted: ["m1"], notifyOpenSeat: false }),
    ).resolves.toBeUndefined();

    expect(h.evaluateAndGrantTitles).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
