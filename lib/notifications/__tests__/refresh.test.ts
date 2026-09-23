import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mutateNotifications,
  refreshNotifications,
  startNotificationSession,
} from "@/lib/notifications/refresh";
import {
  appendNotifications,
  clearAll,
  markRead,
  useNotifications,
  useUnreadCount,
} from "@/lib/notifications/store";
import type { Notification } from "@/lib/queries/notification";

vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));

const item = { noti_id: "1", read_yn: false, crt_at: "2026-09-23T00:00:00Z" };
const response = (items = [item], unreadCount = items.length) => ({
  ok: true,
  json: async () => ({ notifications: items, unreadCount }),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("알림 이벤트 조회", () => {
  let stop: () => void;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    stop = startNotificationSession("member-a");
  });
  afterEach(() => { stop(); vi.unstubAllGlobals(); });

  it("동시에 열린 알림창과 복귀 조회를 합친다", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(pending.promise);
    const first = refreshNotifications("member-a", "resume");
    const second = refreshNotifications("member-a", "open");
    expect(first).toBe(second);
    pending.resolve(response());
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useUnreadCount()).toBe(1);
  });

  it("조회 중 푸시 여러 건은 후속 조회 하나로 최신 상태를 반영한다", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response([{ ...item, noti_id: "2" }]));
    const first = refreshNotifications("member-a");
    void refreshNotifications("member-a", "push");
    void refreshNotifications("member-a", "push");
    pending.resolve(response());
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useNotifications()[0].noti_id).toBe("2");
  });

  it("숨긴 탭에서는 조회하지 않고 복귀하면 갱신한다", async () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    await refreshNotifications("member-a", "push");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("document", { visibilityState: "visible" });
    fetchMock.mockResolvedValue(response());
    await refreshNotifications("member-a", "resume");
    await refreshNotifications("member-a", "resume");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 복귀 간격(30초)을 넓히면서 생긴 구멍 — 숨긴 동안 온 푸시를 버리고 복귀 조회까지
  // 제한에 걸리면 "푸시를 받고 앱에 돌아왔는데 뱃지가 그대로"가 된다.
  it("숨긴 동안 받은 푸시는 복귀 제한을 건너뛰고 반영된다", async () => {
    fetchMock.mockResolvedValue(response());
    await refreshNotifications("member-a", "resume");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal("document", { visibilityState: "hidden" });
    await refreshNotifications("member-a", "push");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 방금 복귀 조회를 했으므로 제한 안이지만, 놓친 푸시가 있어 통과해야 한다.
    vi.stubGlobal("document", { visibilityState: "visible" });
    await refreshNotifications("member-a", "resume");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("놓친 푸시가 없으면 잦은 복귀는 여전히 제한된다", async () => {
    fetchMock.mockResolvedValue(response());
    await refreshNotifications("member-a", "resume");
    vi.stubGlobal("document", { visibilityState: "hidden" });
    await refreshNotifications("member-a", "resume"); // 숨겨질 때도 같은 리스너가 돈다
    vi.stubGlobal("document", { visibilityState: "visible" });
    await refreshNotifications("member-a", "resume");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("로그아웃 전 응답이 목록을 되살리지 않는다", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(pending.promise);
    const first = refreshNotifications("member-a");
    stop();
    pending.resolve(response());
    await first;
    expect(useNotifications()).toEqual([]);
    expect(useUnreadCount()).toBe(0);
  });

  it("다른 계정의 조회가 끝난 뒤 도착한 이전 계정 응답을 버린다", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response([{ ...item, noti_id: "b" }]));
    const first = refreshNotifications("member-a");
    stop();
    stop = startNotificationSession("member-b");
    await refreshNotifications("member-b");
    pending.resolve(response());
    await first;
    expect(useNotifications()[0].noti_id).toBe("b");
  });

  it("삭제 중에는 조회를 미루고 늦게 도착한 목록을 버린다", async () => {
    fetchMock.mockResolvedValueOnce(response());
    await refreshNotifications("member-a");
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response([]));
    const reading = refreshNotifications("member-a");
    const action = deferred<void>();
    const writing = mutateNotifications(clearAll, () => action.promise);
    void refreshNotifications("member-a", "push");
    pending.resolve(response());
    await reading;
    expect(useNotifications()).toEqual([]);
    expect(useUnreadCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    action.resolve();
    await writing;
    await refreshNotifications("member-a");
    expect(useNotifications()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("읽음 처리 중 재조회가 읽지 않음으로 되돌리지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response([{ ...item, read_yn: true }], 0));
    await refreshNotifications("member-a");
    const action = deferred<void>();
    const writing = mutateNotifications(() => markRead("1"), () => action.promise);
    await refreshNotifications("member-a", "push");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useUnreadCount()).toBe(0);
    action.resolve();
    await writing;
    await refreshNotifications("member-a");
    expect(useNotifications()[0].read_yn).toBe(true);
    expect(useUnreadCount()).toBe(0);
  });

  it("조회 실패 뒤 다음 알림창 열기에서 재시도한다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(response());
    expect(await refreshNotifications("member-a")).toBe(false);
    expect(await refreshNotifications("member-a")).toBe(true);
    expect(useNotifications()).toHaveLength(1);
  });

  // 실패했다고 빠져나가면 조회 중 도착한 푸시가 세워 둔 재시도 표시가 함께 버려졌다 —
  // 그 푸시 건은 다음 복귀·알림창 열기까지 뱃지에 안 올라왔다.
  it("조회가 실패해도 그 사이 도착한 푸시는 버리지 않는다", async () => {
    const pending = deferred<{ ok: boolean }>();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response());
    const first = refreshNotifications("member-a");
    void refreshNotifications("member-a", "push");
    pending.resolve({ ok: false });
    expect(await first).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useNotifications()).toHaveLength(1);
  });

  // 세션은 루트 채널이 붙어야 생긴다 — 아직 없거나(늦은 하이드레이션) 영영 없을 때
  // (`getCurrentMember()` 실패) 읽음·삭제가 서버 호출도 없이 조용히 성공하면 안 된다.
  it("세션이 없어도 낙관적 반영과 서버 액션을 건너뛰지 않는다", async () => {
    stop();
    const optimistic = vi.fn();
    const action = vi.fn().mockResolvedValue(undefined);
    await mutateNotifications(optimistic, action);
    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    stop = startNotificationSession("member-a");
  });

  // 낙관적 반영이 try 밖에 있던 시절엔 여기서 던지면 쓰기 카운터가 1에 굳어,
  // 이후 모든 조회가 영영 보류되고 목록·뱃지가 새로고침 전까지 얼어붙었다.
  it("낙관적 반영이 던져도 이후 조회가 막히지 않는다", async () => {
    fetchMock.mockResolvedValue(response());
    await expect(
      mutateNotifications(() => { throw new Error("boom"); }, async () => {}),
    ).rejects.toThrow("boom");
    // 카운터가 새면 `refreshNotifications`가 조회 없이 true만 돌려주므로,
    // **fetch가 실제로 한 번 더 나갔는가**로 잰다(실패 복원 조회가 이미 한 번 나가 있다).
    const before = fetchMock.mock.calls.length;
    expect(await refreshNotifications("member-a")).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  // 다음 장을 붙일 때 revision을 안 올리면, 떠 있던 첫 장 조회가 그걸 모르고 돌아와 덮는다.
  it("다음 장을 받은 뒤 도착한 첫 장 응답이 목록을 덮지 않는다", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(pending.promise);
    const refreshing = refreshNotifications("member-a");
    appendNotifications([{ ...item, noti_id: "2" }] as unknown as Notification[]);
    pending.resolve(response());
    await refreshing;
    expect(useNotifications().map((n) => n.noti_id)).toEqual(["2"]);
  });
});
