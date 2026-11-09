import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env 는 t3-env 라 모듈 로드 시점에 검증된다 — 테스트마다 값을 갈아끼우기 위해 mock 한다.
const envMock = vi.hoisted(() => ({
  KAKAO_HUB_URL: undefined as string | undefined,
  KAKAO_WEBHOOK_URL: undefined as string | undefined,
  KAKAO_WEBHOOK_SECRET: undefined as string | undefined,
  KAKAO_ROOM: undefined as string | undefined,
  KAKAO_SERVICE_API_KEY: undefined as string | undefined,
  KAKAO_ROOM_ID: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: envMock }));

// 방은 팀 설정(team_cfg kakao.room_id)에서 온다 — 팀별 방을 테스트마다 갈아끼운다.
const TEAM = "team-gigang";
const OTHER_TEAM = "team-ulsan";
const cfgMock = vi.hoisted(() => ({ rooms: {} as Record<string, string | null> }));
vi.mock("@/lib/team-cfg/read", () => ({
  getTeamCfg: async (teamId: string) => cfgMock.rooms[teamId] ?? null,
}));

// 이력 기록은 service-role 로 DB 에 쓴다 — 여기서는 "무엇을 남기려 했는지"만 본다.
const recordKakaoSend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/kakao/send-log", () => ({ recordKakaoSend }));

import { defaultKakaoRoom, isKakaoConfigured, sendKakao } from "@/lib/kakao/notify";

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
    envMock.KAKAO_WEBHOOK_SECRET = "nb_test_s3cret";
    envMock.KAKAO_SERVICE_API_KEY = undefined;
    envMock.KAKAO_ROOM_ID = undefined;
    cfgMock.rooms = { [TEAM]: "기강웹TF" };
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

    const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://hub.example/v1/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer nb_test_s3cret");
    expect(sentBody(fetchFn)).toMatchObject({ room: "기강웹TF", msg: "안녕" });
  });

  it("옛 환경변수(전체 주소)도 origin 으로 정규화해 받는다", async () => {
    envMock.KAKAO_HUB_URL = undefined;
    envMock.KAKAO_WEBHOOK_URL = "https://hub.example/v1/messages";
    const fetchFn = acceptingFetch();

    await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

    expect(fetchFn.mock.calls[0][0]).toBe("https://hub.example/v1/messages");
  });

  it("requestId 를 넘기면 그대로 실어 보낸다 — 허브가 같은 id 는 두 번 보내지 않는다", async () => {
    const fetchFn = acceptingFetch();

    await sendKakao("안녕", {
      teamId: TEAM,
      requestId: "gathering:g1:created",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(sentBody(fetchFn).request_id).toBe("gathering:g1:created");
  });

  it("mentions 를 넘기면 이름으로 태그하도록 허브에 그대로 넘긴다 — 없으면 키도 안 보낸다", async () => {
    const fetchFn = acceptingFetch();

    await sendKakao("@이현근 확인 부탁", {
      teamId: TEAM,
      mentions: ["이현근"],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await sendKakao("그냥 공지", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

    expect(sentBody(fetchFn)).toMatchObject({ msg: "@이현근 확인 부탁", mentions: ["이현근"] });
    expect(JSON.parse(String(fetchFn.mock.calls[1][1].body))).not.toHaveProperty("mentions");
  });

  it("허브가 이름을 못 정하면(동명이인 등) 던지지 않고 실패로 기록한다", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json(
        {
          error: "mention_name_ambiguous",
          name: "김준",
          candidates: [
            { userId: "1", name: "김준민" },
            { userId: "2", name: "김준호" },
          ],
        },
        { status: 400 },
      ),
    );

    const result = await sendKakao("x", {
      teamId: TEAM,
      mentions: ["김준"],
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.failure).toMatchObject({ code: "mention_name_ambiguous" });
  });

  it("room 을 넘기면 기본방 대신 그 방으로 간다", async () => {
    const fetchFn = acceptingFetch();

    await sendKakao("안녕", { teamId: TEAM, room: "다른방", fetchFn: fetchFn as unknown as typeof fetch });

    expect(sentBody(fetchFn).room).toBe("다른방");
  });

  describe("콘솔 가이드 이름(KAKAO_SERVICE_API_KEY) · 방 고정 ID", () => {
    const ROOM_ID = "4b492fd2-bb84-43be-a663-4e5f087ffb2e";

    it("팀 방이 고정 ID 면 방 이름 대신 고정 ID 경로로 보낸다 — 방 이름이 바뀌어도 안 끊긴다", async () => {
      cfgMock.rooms[TEAM] = ROOM_ID;
      const fetchFn = acceptingFetch({ room: "기강웹TF" });

      const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(result.ok).toBe(true);
      expect(fetchFn.mock.calls[0][0]).toBe(`https://hub.example/v1/rooms/id/${ROOM_ID}/messages`);
      expect(sentBody(fetchFn).room).toBeUndefined();
    });

    it("KAKAO_SERVICE_API_KEY 가 옛 KAKAO_WEBHOOK_SECRET 보다 우선한다", async () => {
      envMock.KAKAO_SERVICE_API_KEY = "nb_live_new";
      const fetchFn = acceptingFetch();

      await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      const init = fetchFn.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer nb_live_new");
    });

    it("옛 kb_ 키는 허브에 보내지 않고 실패로 남긴다 — 워크스페이스 키(nb_live_)로 바꿔야 한다", async () => {
      envMock.KAKAO_SERVICE_API_KEY = "kb_old_key";
      const fetchFn = acceptingFetch();

      const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(result.ok).toBe(false);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("새 이름만 있어도 보낸다 — 옛 변수를 지운 뒤에도 동작", async () => {
      envMock.KAKAO_WEBHOOK_SECRET = undefined;
      envMock.KAKAO_SERVICE_API_KEY = "nb_live_new";
      cfgMock.rooms[TEAM] = ROOM_ID;
      const fetchFn = acceptingFetch({ room: "기강웹TF" });

      const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(result.ok).toBe(true);
    });

    it("이력에는 고정 ID 를 유지한다 — 표시 이름이 바뀌어도 재시도 대상이 같게", async () => {
      cfgMock.rooms[TEAM] = ROOM_ID;
      const fetchFn = acceptingFetch({ room: "기강웹TF" });

      await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(recordKakaoSend).toHaveBeenCalledWith(expect.objectContaining({ room: ROOM_ID }));
    });

    it("실패해서 이름을 모르면 ID 를 남기고, 다시 보내기는 그 ID 를 고정 ID 로 쓴다", async () => {
      cfgMock.rooms[TEAM] = ROOM_ID;
      const failing = vi.fn(async () => new Response("boom", { status: 503 }));
      await sendKakao("안녕", { teamId: TEAM, fetchFn: failing as unknown as typeof fetch });
      expect(recordKakaoSend).toHaveBeenCalledWith(expect.objectContaining({ room: ROOM_ID }));

      const fetchFn = acceptingFetch({ room: "기강웹TF" });
      await sendKakao("안녕", { teamId: TEAM, room: ROOM_ID, fetchFn: fetchFn as unknown as typeof fetch });
      expect(fetchFn.mock.calls[0][0]).toBe(`https://hub.example/v1/rooms/id/${ROOM_ID}/messages`);
    });
  });

  describe("isKakaoConfigured — 발송 여부를 말하는 쪽도 sendKakao 와 같은 판정을 쓴다", () => {
    it("새 이름 · 옛 이름 어느 쪽 조합이든 켜진 것으로 본다", async () => {
      expect(await isKakaoConfigured(TEAM)).toBe(true);
      envMock.KAKAO_HUB_URL = undefined;
      envMock.KAKAO_WEBHOOK_URL = undefined;
      expect(await isKakaoConfigured(TEAM)).toBe(false);
      envMock.KAKAO_HUB_URL = "https://hub.example";
      cfgMock.rooms[TEAM] = "4b492fd2-bb84-43be-a663-4e5f087ffb2e";
      envMock.KAKAO_WEBHOOK_SECRET = undefined;
      envMock.KAKAO_SERVICE_API_KEY = "nb_live_new";
      expect(await isKakaoConfigured(TEAM)).toBe(true);
    });
  });

  describe("defaultKakaoRoom — 미리보기가 말하는 방은 sendKakao 가 실제로 쓰는 방이다", () => {
    it("팀 설정의 방이 미리보기에 나오고, 이력에 남는 값과 같다", async () => {
      expect(await defaultKakaoRoom(TEAM)).toBe("기강웹TF");
      cfgMock.rooms[TEAM] = "4b492fd2-bb84-43be-a663-4e5f087ffb2e";
      expect(await defaultKakaoRoom(TEAM)).toBe("4b492fd2-bb84-43be-a663-4e5f087ffb2e");
    });

    it("노티봇이 꺼진 환경이면 방이 설정돼 있어도 null — 보내지 않을 방을 보여주지 않는다", async () => {
      envMock.KAKAO_HUB_URL = undefined;
      expect(await defaultKakaoRoom(TEAM)).toBeNull();
    });
  });

  describe("팀별 방 — 다른 팀 공지가 다른 방으로 새지 않는다", () => {
    it("방이 없는 팀은 보내지 않는다 — 기강 방으로 대신 보내지 않는다", async () => {
      const fetchFn = vi.fn();

      const result = await sendKakao("울산 모임", { teamId: OTHER_TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, skipped: "disabled" });
      expect(recordKakaoSend).not.toHaveBeenCalled();
      expect(await isKakaoConfigured(OTHER_TEAM)).toBe(false);
      expect(await defaultKakaoRoom(OTHER_TEAM)).toBeNull();
    });

    it("팀마다 자기 방으로 간다", async () => {
      cfgMock.rooms[OTHER_TEAM] = "울산방";
      const fetchFn = acceptingFetch();

      await sendKakao("울산 모임", { teamId: OTHER_TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(sentBody(fetchFn).room).toBe("울산방");
      expect(recordKakaoSend).toHaveBeenCalledWith(expect.objectContaining({ teamId: OTHER_TEAM, room: "울산방" }));
    });

    it("환경변수 방은 더 이상 읽지 않는다 — 팀 설정이 없으면 env 에 방이 있어도 안 보낸다", async () => {
      envMock.KAKAO_ROOM_ID = "4b492fd2-bb84-43be-a663-4e5f087ffb2e";
      envMock.KAKAO_ROOM = "기강웹TF";
      const fetchFn = vi.fn();

      await sendKakao("울산 모임", { teamId: OTHER_TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe("환경변수가 비면 아무것도 호출하지 않는다 — 로컬·preview 안전장치", () => {
    it.each([
      ["허브 주소", () => { envMock.KAKAO_HUB_URL = undefined; }],
      ["방", () => { cfgMock.rooms[TEAM] = null; }],
      // 키 없이 쏘면 허브가 어차피 401 이라 보낼 이유가 없다.
      ["API 키", () => { envMock.KAKAO_WEBHOOK_SECRET = undefined; }],
    ])("%s 미설정", async (_label, unset) => {
      unset();
      const fetchFn = vi.fn();

      const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

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

    const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.ok).toBe(false);
    expect(result.failure).toMatchObject({ name: "NotiBotApiError", status: 502, retryable: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("네트워크 오류도 삼킨다 — 모임 등록은 이미 성공한 뒤다", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.ok).toBe(false);
    // 오늘 아침 사고가 이 모양이었다 — 와이파이가 끊겨 허브에 닿지 못했다.
    expect(result.failure).toMatchObject({ name: "NotiBotTransportError", retryable: true });
  });

  it("응답이 유실돼도 자동 생성한 멱등 키를 이력에 남긴다", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("response lost"));
    cfgMock.rooms[TEAM] = "4b492fd2-bb84-43be-a663-4e5f087ffb2e";

    await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

    const requestId = sentBody(fetchFn).request_id;
    expect(requestId).toEqual(expect.any(String));
    expect(recordKakaoSend).toHaveBeenCalledWith(expect.objectContaining({
      requestId, room: cfgMock.rooms[TEAM], status: "failed",
    }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("409 는 재시도 불가로 기록한다 — 이미 접수된 건이라 다시 보내면 중복이다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(Response.json({ error: "idempotency_conflict" }, { status: 409 }));

    const result = await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

    expect(result.failure).toMatchObject({ code: "idempotency_conflict", retryable: false });
  });

  describe("발송 이력", () => {
    it("성공하면 허브가 쓴 request_id 로 남긴다 — 재발송이 그 값을 그대로 써야 한다", async () => {
      const fetchFn = acceptingFetch();

      await sendKakao("안녕", {
        teamId: TEAM,
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

    it("MCP 공지는 출처 mcp_notice 와 보낸 사람으로 남는다(#631)", async () => {
      const fetchFn = acceptingFetch();

      await sendKakao("공지", {
        teamId: TEAM,
        requestId: "n-1",
        source: { type: "mcp_notice", id: "audit-1" },
        actorMemId: "11111111-1111-1111-1111-111111111111",
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      expect(recordKakaoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "success",
          requestId: "n-1",
          source: { type: "mcp_notice", id: "audit-1" },
          actorMemId: "11111111-1111-1111-1111-111111111111",
          resend: false,
        }),
      );
    });

    it("허브가 duplicate:true 로 답하면 결과에 싣고 이력은 duplicate 로 남긴다(#631)", async () => {
      // 같은 request_id 재호출 — 허브는 2xx 를 주지만 새로 보내지 않는다(2026-11-07 실측: 톡방엔 1건).
      const fetchFn = acceptingFetch({ queued: false, duplicate: true });

      const result = await sendKakao("공지", {
        teamId: TEAM,
        requestId: "n-1",
        source: { type: "mcp_notice", id: "audit-1" },
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      // ok 는 그대로 true — 모임 공지 등 기존 호출부는 ok 로만 판정하므로 동작이 안 바뀐다.
      expect(result).toEqual({ ok: true, duplicate: true });
      expect(recordKakaoSend).toHaveBeenCalledWith(
        expect.objectContaining({ status: "duplicate", requestId: "n-1" }),
      );
    });

    it("duplicate 가 없거나 false 면 지금처럼 성공 — 결과 모양도 그대로 { ok: true }", async () => {
      for (const extra of [{}, { duplicate: false }]) {
        recordKakaoSend.mockClear();
        const fetchFn = acceptingFetch(extra);

        const result = await sendKakao("안녕", {
          teamId: TEAM,
          source: { type: "gathering_created", id: "g1" },
          fetchFn: fetchFn as unknown as typeof fetch,
        });

        expect(result).toEqual({ ok: true });
        expect(recordKakaoSend).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
      }
    });

    it("실패하면 분류까지 함께 남긴다", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

      await sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch });

      expect(recordKakaoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          failure: expect.objectContaining({ name: "NotiBotTransportError", retryable: true }),
        }),
      );
    });

    it("이력 기록이 터져도 발송 결과는 그대로다 — 꼬리가 몸통을 흔들지 않는다", async () => {
      recordKakaoSend.mockRejectedValueOnce(new Error("DB down"));
      const fetchFn = acceptingFetch();

      await expect(
        sendKakao("안녕", { teamId: TEAM, fetchFn: fetchFn as unknown as typeof fetch }),
      ).resolves.toMatchObject({ ok: true });
    });
  });
});
