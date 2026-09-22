import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env 는 t3-env 라 모듈 로드 시점에 검증된다 — 테스트마다 값을 갈아끼우기 위해 mock 한다.
const envMock = vi.hoisted(() => ({
  KAKAO_WEBHOOK_URL: undefined as string | undefined,
  KAKAO_WEBHOOK_SECRET: undefined as string | undefined,
  KAKAO_ROOM: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({ env: envMock }));

import { sendKakao } from "@/lib/kakao/notify";

function okResponse() {
  return { ok: true, status: 202, text: async () => "" } as unknown as Response;
}

describe("sendKakao", () => {
  beforeEach(() => {
    envMock.KAKAO_WEBHOOK_URL = "https://bridge.example/webhook";
    envMock.KAKAO_WEBHOOK_SECRET = "s3cret";
    envMock.KAKAO_ROOM = "기강웹TF";
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("브리지 계약대로 보낸다 — X-Webhook-Token + {room,msg}", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://bridge.example/webhook");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Webhook-Token"]).toBe("s3cret");
    expect(JSON.parse(init.body)).toEqual({ room: "기강웹TF", msg: "안녕" });
  });

  it("room 을 넘기면 기본방 대신 그 방으로 간다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await sendKakao("안녕", { room: "다른방", fetchFn: fetchFn as unknown as typeof fetch });

    expect(JSON.parse(fetchFn.mock.calls[0][1].body).room).toBe("다른방");
  });

  it("URL 미설정이면 아무것도 호출하지 않는다 — 로컬·preview 안전장치", async () => {
    envMock.KAKAO_WEBHOOK_URL = undefined;
    const fetchFn = vi.fn();

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, skipped: "disabled" });
  });

  it("방 미설정이면 보내지 않는다 — 기본방 없이 쏘면 브리지가 어디로 보낼지 모른다", async () => {
    envMock.KAKAO_ROOM = undefined;
    const fetchFn = vi.fn();

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, skipped: "disabled" });
  });

  it("시크릿이 없으면 토큰 헤더를 빼고 보낸다", async () => {
    envMock.KAKAO_WEBHOOK_SECRET = undefined;
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(fetchFn.mock.calls[0][1].headers["X-Webhook-Token"]).toBeUndefined();
  });

  it("5xx 여도 던지지 않고 재시도하지 않는다 — 카톡엔 이미 도착했을 수 있다", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "<html>bad gateway</html>",
    } as unknown as Response);

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toEqual({ ok: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("네트워크 오류도 삼킨다 — 모임 등록은 이미 성공한 뒤다", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toEqual({ ok: false });
  });
});
