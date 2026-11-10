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

const { getTeamCfg, getTeamCfgStrict, invalidateTeamCfgCache, __clearTeamCfgCacheForTest } = await import(
  "@/lib/team-cfg/read"
);

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

describe("getTeamCfg — 조회 실패·저장 중 조회", () => {
  beforeEach(() => {
    __clearTeamCfgCacheForTest();
    h.responses = [];
    h.calls = 0;
  });

  it("기본값이 '켬'인 키(회비)는 조회에 실패하면 끈다 — 회비를 꺼 둔 팀에 그 순간 켜지지 않게", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.responses = [{ data: null, error: { message: "connection reset" } }];
    await expect(getTeamCfg("team-a", "feature.dues")).resolves.toBe(false);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("엄격 조회는 실패를 '설정 안 함'과 구별해 던진다(카톡방: 미설정 ≠ 조회 실패)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.responses = [{ data: null, error: { message: "connection reset" } }];
    await expect(getTeamCfgStrict("team-a", "kakao.room_id")).rejects.toThrow("팀 설정 조회 실패");
    err.mockRestore();
  });

  it("엄격 조회도 행이 없으면 기본값(없음) — 일부러 안 넣은 팀은 실패가 아니다", async () => {
    h.responses = [{ data: [], error: null }];
    await expect(getTeamCfgStrict("team-a", "kakao.room_id")).resolves.toBeNull();
  });

  it("조회 도중 저장되면 그 옛 결과는 캐시에 남기지 않는다 — 다음 요청이 새로 읽는다", async () => {
    h.responses = [{ data: ROOM, error: null }, { data: [{ cfg_cd: "kakao.room_id", cfg_val_json: "room-2" }], error: null }];
    const pending = getTeamCfg("team-a", "kakao.room_id");
    invalidateTeamCfgCache("team-a"); // 저장
    await pending;
    await expect(getTeamCfg("team-a", "kakao.room_id")).resolves.toBe("room-2");
    expect(h.calls).toBe(2);
  });
});
