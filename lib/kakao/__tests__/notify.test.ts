import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env 는 t3-env 라 모듈 로드 시점에 검증된다 — 테스트마다 값을 갈아끼우기 위해 mock 한다.
const envMock = vi.hoisted(() => ({
  KAKAO_HUB_URL: undefined as string | undefined,
  KAKAO_WEBHOOK_URL: undefined as string | undefined,
  KAKAO_WEBHOOK_SECRET: undefined as string | undefined,
  KAKAO_ROOM: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: envMock }));

// 이력 기록은 service-role 로 DB 에 쓴다 — 여기서는 "무엇을 남기려 했는지"만 본다.
const recordKakaoSend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/kakao/send-log", () => ({ recordKakaoSend }));

import { sendKakao } from "@/lib/kakao/notify";

/**
 * 허브처럼 받아 주는 fetch. **요청의 `request_id` 를 그대로 되돌려줘야 한다** —
 * SDK 가 응답의 id 가 보낸 id 와 같은지 확인하고, 다르면 프로토콜 오류로 던진다.
 */
const acceptingFetch = (extra: Record<string, unknown> = {}) =>
  vi.fn(async (_url: unknown, init: RequestInit) =>
    Response.json(
      {
        ok: true,
        queued: true,
        request_id: JSON.parse(String(init?.body)).request_id,
        ...extra,
      },
      { status: 202 },
    ),
  );

/** 허브로 간 요청 본문. */
const sentBody = (fetchFn: ReturnType<typeof vi.fn>) =>
  JSON.parse(String(fetchFn.mock.calls[0][1].body)) as Record<string, unknown>;

describe("sendKakao", () => {
  beforeEach(() => {
    envMock.KAKAO_HUB_URL = "https://hub.example";
    envMock.KAKAO_WEBHOOK_URL = undefined;
    envMock.KAKAO_WEBHOOK_SECRET = "s3cret";
    envMock.KAKAO_ROOM = "기강웹TF";
    // 진짜 구현은 Promise<void> 라 호출부가 `.catch` 를 건다.
    recordKakaoSend.mockResolvedValue(undefined);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    recordKakaoSend.mockReset();
  });

  it("허브 계약대로 보낸다 — POST /v1/messages + Bearer + {room,msg}", async () => {
    const fetchFn = acceptingFetch();

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://hub.example/v1/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
    expect(sentBody(fetchFn)).toMatchObject({ room: "기강웹TF", msg: "안녕" });
  });

  it("옛 환경변수(전체 주소)도 origin 으로 정규화해 받는다", async () => {
    envMock.KAKAO_HUB_URL = undefined;
    envMock.KAKAO_WEBHOOK_URL = "https://hub.example/v1/messages";
    const fetchFn = acceptingFetch();

    await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(fetchFn.mock.calls[0][0]).toBe("https://hub.example/v1/messages");
  });

  it("requestId 를 넘기면 그대로 실어 보낸다 — 허브가 같은 id 는 두 번 보내지 않는다", async () => {
    const fetchFn = acceptingFetch();

    await sendKakao("안녕", {
      requestId: "gathering:g1:created",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(sentBody(fetchFn).request_id).toBe("gathering:g1:created");
  });

  it("room 을 넘기면 기본방 대신 그 방으로 간다", async () => {
    const fetchFn = acceptingFetch();

    await sendKakao("안녕", { room: "다른방", fetchFn: fetchFn as unknown as typeof fetch });

    expect(sentBody(fetchFn).room).toBe("다른방");
  });

  describe("환경변수가 비면 아무것도 호출하지 않는다 — 로컬·preview 안전장치", () => {
    it.each([
      ["허브 주소", () => { envMock.KAKAO_HUB_URL = undefined; }],
      ["방", () => { envMock.KAKAO_ROOM = undefined; }],
      // 키 없이 쏘면 허브가 어차피 401 이라 보낼 이유가 없다.
      ["API 키", () => { envMock.KAKAO_WEBHOOK_SECRET = undefined; }],
    ])("%s 미설정", async (_label, unset) => {
      unset();
      const fetchFn = vi.fn();

      const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, skipped: "disabled" });
      // 보내지 않은 것은 이력에도 남기지 않는다 — 로컬에서 쓰레기 행이 쌓인다.
      expect(recordKakaoSend).not.toHaveBeenCalled();
    });
  });

  it("5xx 여도 던지지 않고 재시도하지 않는다 — 카톡엔 이미 도착했을 수 있다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(Response.json({ error: "request_failed" }, { status: 502 }));

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.ok).toBe(false);
    expect(result.failure).toMatchObject({ name: "KakaoApiError", status: 502, retryable: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("네트워크 오류도 삼킨다 — 모임 등록은 이미 성공한 뒤다", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.ok).toBe(false);
    // 오늘 아침 사고가 이 모양이었다 — 와이파이가 끊겨 허브에 닿지 못했다.
    expect(result.failure).toMatchObject({ name: "KakaoTransportError", retryable: true });
  });

  it("409 는 재시도 불가로 기록한다 — 이미 접수된 건이라 다시 보내면 중복이다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(Response.json({ error: "idempotency_conflict" }, { status: 409 }));

    const result = await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.failure).toMatchObject({ code: "idempotency_conflict", retryable: false });
  });

  describe("발송 이력", () => {
    it("성공하면 허브가 쓴 request_id 로 남긴다 — 재발송이 그 값을 그대로 써야 한다", async () => {
      const fetchFn = acceptingFetch();

      await sendKakao("안녕", {
        source: { type: "gathering_created", id: "g1" },
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      expect(recordKakaoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "success",
          room: "기강웹TF",
          message: "안녕",
          // 안 넘겼으므로 SDK 가 만든 값이 그대로 올라와야 한다.
          requestId: JSON.parse(String(fetchFn.mock.calls[0][1].body)).request_id,
          source: { type: "gathering_created", id: "g1" },
          resend: false,
        }),
      );
    });

    it("실패하면 분류까지 함께 남긴다", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

      await sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch });

      expect(recordKakaoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          failure: expect.objectContaining({ name: "KakaoTransportError", retryable: true }),
        }),
      );
    });

    it("이력 기록이 터져도 발송 결과는 그대로다 — 꼬리가 몸통을 흔들지 않는다", async () => {
      recordKakaoSend.mockRejectedValueOnce(new Error("DB down"));
      const fetchFn = acceptingFetch();

      await expect(
        sendKakao("안녕", { fetchFn: fetchFn as unknown as typeof fetch }),
      ).resolves.toMatchObject({ ok: true });
    });
  });
});
