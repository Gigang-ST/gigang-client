import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = readFileSync(resolve("public/sw.js"), "utf8");

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const postMessage = vi.fn();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([{ postMessage }]);
  runInNewContext(source, {
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      registration: { showNotification },
      clients: { matchAll },
    },
  });
  async function push() {
    const waitUntil = vi.fn();
    handlers.get("push")!({
      data: { json: () => ({ title: "새 알림", body: "개인 알림 내용", url: "/profile" }) },
      waitUntil,
    });
    await waitUntil.mock.calls[0][0];
  }
  return { push, postMessage, showNotification, matchAll };
}

describe("푸시 수신과 열린 화면 갱신", () => {
  it("OS 알림과 내용 없는 갱신 신호를 함께 보낸다", async () => {
    const w = worker();
    await w.push();
    expect(w.showNotification).toHaveBeenCalledWith("새 알림", expect.objectContaining({
      body: "개인 알림 내용", data: { url: "/profile" },
    }));
    expect(w.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(w.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "NOTIFICATIONS_CHANGED" });
  });

  it("열린 페이지 조회가 실패해도 OS 알림은 표시한다", async () => {
    const w = worker();
    w.matchAll.mockRejectedValue(new Error("페이지 조회 실패"));
    await w.push();
    expect(w.showNotification).toHaveBeenCalledOnce();
  });

  it("OS 알림 표시 실패가 열린 페이지 갱신을 막지 않는다", async () => {
    const w = worker();
    w.showNotification.mockRejectedValue(new Error("표시 실패"));
    await w.push();
    expect(w.postMessage).toHaveBeenCalledOnce();
  });

  it("앱이 닫혀 있어도 OS 알림을 유지한다", async () => {
    const w = worker();
    w.matchAll.mockResolvedValue([]);
    await w.push();
    expect(w.showNotification).toHaveBeenCalledOnce();
    expect(w.postMessage).not.toHaveBeenCalled();
  });
});
