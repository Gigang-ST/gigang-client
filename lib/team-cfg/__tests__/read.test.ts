import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 팀 설정 읽기 — 같은 순간 온 요청들은 조회 하나를 나눠 쓴다. 그 조회가 **요청 취소(abort)** 로 끊기면
 * 기다리던 요청까지 "못 읽음"을 받는데, 그걸 기본값으로 쓰면 기본값이 '없음'인 키(카톡방 등)가 그 한 번
 * 조용히 꺼진다. 취소된 결과를 받은 쪽은 자기가 한 번 더 읽어야 한다.
 */

const h = vi.hoisted(() => ({
  responses: [] as { data: unknown; error: unknown }[],
  calls: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      then: (resolve: (v: unknown) => void) => {
        h.calls += 1;
        resolve(h.responses.shift() ?? { data: [], error: null });
      },
    };
    return { from: () => builder };
  },
}));

const { getTeamCfg, __clearTeamCfgCacheForTest } = await import("@/lib/team-cfg/read");

const ABORT = { message: "AbortError: This operation was aborted", hint: "Request was aborted" };
const ROOM = [{ cfg_cd: "kakao.room_id", cfg_val_json: "room-1" }];

describe("getTeamCfg — 취소된 조회", () => {
  beforeEach(() => {
    __clearTeamCfgCacheForTest();
    h.responses = [];
    h.calls = 0;
  });

  it("취소된 결과를 받으면 기본값을 쓰지 않고 다시 읽는다", async () => {
    h.responses = [{ data: null, error: ABORT }, { data: ROOM, error: null }];
    await expect(getTeamCfg("team-a", "kakao.room_id")).resolves.toBe("room-1");
    expect(h.calls).toBe(2);
  });

  it("다시 읽은 값은 캐시해 다음 요청은 DB 를 안 부른다", async () => {
    h.responses = [{ data: null, error: ABORT }, { data: ROOM, error: null }];
    await getTeamCfg("team-a", "kakao.room_id");
    await expect(getTeamCfg("team-a", "kakao.room_id")).resolves.toBe("room-1");
    expect(h.calls).toBe(2);
  });

  it("취소가 아닌 실패는 다시 읽지 않고 기본값으로 동작한다(그리고 캐시하지 않는다)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.responses = [{ data: null, error: { message: "permission denied" } }, { data: ROOM, error: null }];
    await expect(getTeamCfg("team-a", "kakao.room_id")).resolves.toBeNull();
    expect(h.calls).toBe(1);
    // 다음 요청은 바로 다시 읽는다
    await expect(getTeamCfg("team-a", "kakao.room_id")).resolves.toBe("room-1");
    err.mockRestore();
  });
});
