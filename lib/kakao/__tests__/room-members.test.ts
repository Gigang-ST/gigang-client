import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  KAKAO_HUB_URL: "https://hub.example" as string | undefined,
  KAKAO_WEBHOOK_URL: undefined as string | undefined,
  KAKAO_WEBHOOK_SECRET: undefined as string | undefined,
  KAKAO_SERVICE_API_KEY: "nb_test_x" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: envMock }));

const cfgMock = vi.hoisted(() => ({ room: null as string | null }));
vi.mock("@/lib/team-cfg/read", () => ({
  getTeamCfg: async () => cfgMock.room,
  getTeamCfgStrict: async () => cfgMock.room,
}));
vi.mock("@/lib/kakao/send-log", () => ({ recordKakaoSend: vi.fn() }));

import { fetchKakaoRoomMembers } from "@/lib/kakao/notify";

const ROOM_ID = "11111111-1111-1111-1111-111111111111";
const membersBody = {
  members: [
    { userId: "101", name: "홍길동", mention: "<@101>" },
    { userId: "102", name: null, mention: "<@102>" },
  ],
  known: 2,
  total: 3,
  openChat: true,
  syncedAt: 1700000000000,
};

beforeEach(() => {
  envMock.KAKAO_HUB_URL = "https://hub.example";
  envMock.KAKAO_SERVICE_API_KEY = "nb_test_x";
  cfgMock.room = ROOM_ID;
});

describe("fetchKakaoRoomMembers", () => {
  it("환경변수가 없으면 부르지 않고 disabled", async () => {
    envMock.KAKAO_SERVICE_API_KEY = undefined;
    const fetchFn = vi.fn();
    const r = await fetchKakaoRoomMembers("t", { fetchFn });
    expect(r).toEqual({ ok: false, skipped: "disabled" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("팀 방이 없으면 no_room", async () => {
    cfgMock.room = null;
    const fetchFn = vi.fn();
    expect(await fetchKakaoRoomMembers("t", { fetchFn })).toEqual({ ok: false, skipped: "no_room" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("고정 ID 방은 바로 참여자를 읽고 이름·완전성만 돌려준다(계정 ID 는 안 넘김)", async () => {
    const fetchFn = vi.fn(async (_url: unknown) => Response.json(membersBody));
    const r = await fetchKakaoRoomMembers("t", { fetchFn });
    expect(r).toEqual({
      ok: true,
      names: ["홍길동", null],
      known: 2,
      total: 3,
      openChat: true,
      syncedAt: 1700000000000,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain(ROOM_ID);
  });

  it("이름으로 설정된 방은 목록에서 정확히 하나 맞을 때만 쓴다", async () => {
    cfgMock.room = "기강웹TF";
    const fetchFn = vi.fn(async (url: unknown) =>
      String(url).includes("/members")
        ? Response.json(membersBody)
        : Response.json({ rooms: [{ id: ROOM_ID, name: "기강웹TF", status: "active", canReply: true }] }),
    );
    const r = await fetchKakaoRoomMembers("t", { fetchFn });
    expect(r.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("이름과 맞는 방이 없으면 RoomUnresolved 실패", async () => {
    cfgMock.room = "없는방";
    const fetchFn = vi.fn(async () => Response.json({ rooms: [] }));
    const r = await fetchKakaoRoomMembers("t", { fetchFn });
    expect(r).toMatchObject({ ok: false, failure: { name: "RoomUnresolved" } });
  });

  it("허브가 거절하면 던지지 않고 failure 를 돌려준다", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ error: { code: "forbidden", message: "scope" } }, { status: 403 }),
    );
    const r = await fetchKakaoRoomMembers("t", { fetchFn });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.failure).toBeTruthy();
  });
});
