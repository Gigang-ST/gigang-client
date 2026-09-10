import { beforeEach, describe, expect, it, vi } from "vitest";

// join_gthr_or_wait RPC 로 옮긴 뒤의 계약을 못박는다.
// - 정원이 차면 waiting 을 돌려준다(예전엔 reason:"full" 로 거절했다)
// - 지난 모임 잠금 판정은 여전히 TS(isPastLockedFor)가 한다 — SQL 에 복제하지 않는다
// vi.mock 패턴은 app/actions/__tests__/gathering-cancel-notify.test.ts 를 따른다.

const h = vi.hoisted(() => {
  const rpc = vi.fn();
  const cfg = {
    gthr: {
      data: null as Record<string, unknown> | null,
      error: null as { message: string } | null,
    },
    pastLocked: false,
  };

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

  return { rpc, cfg, queryStub };
});

vi.mock("@/lib/past-event", () => ({ isPastLockedFor: () => h.cfg.pastLocked }));
vi.mock("server-only", () => ({}));

import { joinGatheringWithCapCheck } from "@/lib/gathering/join-gathering";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = { from: () => h.queryStub(h.cfg.gthr), rpc: h.rpc } as any;
const args = { gthrId: "gthr-1", memId: "mem-1", teamId: "team-1", isAdmin: false };

beforeEach(() => {
  h.rpc.mockReset();
  h.cfg.pastLocked = false;
  h.cfg.gthr.data = {
    gthr_id: "gthr-1",
    stt_at: "2026-12-01T10:00:00Z",
    end_at: null,
    del_yn: false,
  };
  h.cfg.gthr.error = null;
});

describe("joinGatheringWithCapCheck", () => {
  it("자리가 있으면 joined 를 돌려준다", async () => {
    h.rpc.mockResolvedValue({ data: "joined", error: null });

    await expect(joinGatheringWithCapCheck(admin, args)).resolves.toEqual({
      joined: true,
      waiting: false,
    });
  });

  it("정원이 차면 waiting 이다 — 예전처럼 full 로 거절하지 않는다", async () => {
    h.rpc.mockResolvedValue({ data: "waiting", error: null });

    await expect(joinGatheringWithCapCheck(admin, args)).resolves.toEqual({
      joined: false,
      waiting: true,
    });
  });

  it("RPC 에 넘기는 인자는 gthr_id·mem_id·team_id 셋뿐이다(지난모임 판정은 TS 가 한다)", async () => {
    h.rpc.mockResolvedValue({ data: "joined", error: null });

    await joinGatheringWithCapCheck(admin, args);

    expect(h.rpc).toHaveBeenCalledWith("join_gthr_or_wait", {
      p_gthr_id: "gthr-1",
      p_mem_id: "mem-1",
      p_team_id: "team-1",
    });
  });

  it("지난 모임이면 RPC 를 아예 부르지 않는다", async () => {
    h.cfg.pastLocked = true;

    await expect(joinGatheringWithCapCheck(admin, args)).resolves.toEqual({
      joined: false,
      waiting: false,
      reason: "past_locked",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("모임이 없으면 not_found", async () => {
    h.cfg.gthr.data = null;

    await expect(joinGatheringWithCapCheck(admin, args)).resolves.toEqual({
      joined: false,
      waiting: false,
      reason: "not_found",
    });
  });

  it("모임 조회가 에러를 내면 error", async () => {
    h.cfg.gthr.error = { message: "db down" };

    await expect(joinGatheringWithCapCheck(admin, args)).resolves.toEqual({
      joined: false,
      waiting: false,
      reason: "error",
    });
  });

  it("RPC 가 에러를 내면 error", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(joinGatheringWithCapCheck(admin, args)).resolves.toEqual({
      joined: false,
      waiting: false,
      reason: "error",
    });
  });

  it("RPC 가 not_found 를 돌려줘도 not_found 로 옮긴다(조회와 RPC 사이에 삭제된 경우)", async () => {
    h.rpc.mockResolvedValue({ data: "not_found", error: null });

    await expect(joinGatheringWithCapCheck(admin, args)).resolves.toEqual({
      joined: false,
      waiting: false,
      reason: "not_found",
    });
  });
});
