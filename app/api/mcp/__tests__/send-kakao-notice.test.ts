import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * send_kakao_notice 검증(#631).
 *
 * ⚠️ 실제 단톡방 발송 금지 — `@/lib/kakao/notify` 를 통째로 mock 한다. notify.ts 는
 *   send-log.ts(→ "server-only")와 t3-env 를 끌어오므로, 이 mock 이 없으면 vitest 가 로드 단계에서
 *   실패한다([[troubleshooting/vitest-server-only-trap]]). mock 은 발송을 막고 넘긴 옵션을 관측한다 —
 *   발송 이력의 출처·보낸 사람은 `sendKakao` 옵션 그대로 `kakao_send_hist` 에 들어가므로
 *   (`lib/kakao/__tests__/notify.test.ts` 가 그 연결을 지킨다) 여기서는 옵션을 본다.
 */
const { sendKakaoMock, defaultRoomMock } = vi.hoisted(() => ({
  sendKakaoMock: vi.fn(),
  defaultRoomMock: vi.fn<() => string | null>(),
}));
vi.mock("@/lib/kakao/notify", () => ({
  sendKakao: sendKakaoMock,
  defaultKakaoRoom: defaultRoomMock,
  KAKAO_MESSAGE_MAX_LENGTH: 4000,
  KAKAO_REQUEST_ID_MAX_LENGTH: 128,
}));

import {
  sendKakaoNotice,
  SendKakaoNoticeDeniedError,
} from "@/lib/mcp/send-kakao-notice";

const TEAM_ID = "22222222-2222-2222-2222-222222222222";
const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function adminCtx(overrides: Partial<OperatorContext> = {}): OperatorContext {
  return { mem_id: ACTOR_ID, team_id: TEAM_ID, is_admin: true, mem_nm: "관리자", ...overrides };
}

/** mcp_audit_log insert 만 관측하는 최소 스텁. */
function makeSupabase(opts: { auditErr?: unknown } = {}) {
  const calls: { auditInsert: Record<string, unknown> | null; tables: string[] } = {
    auditInsert: null,
    tables: [],
  };
  const builder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      calls.auditInsert = row;
      return builder;
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: opts.auditErr ?? null }),
  };
  const client = {
    from: (table: string) => {
      calls.tables.push(table);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

/** sendKakao 에 넘어간 옵션. */
const sentOpts = () =>
  sendKakaoMock.mock.calls[0][1] as {
    requestId: string;
    mentions?: string[];
    source: { type: string; id: string };
    actorMemId: string;
    room?: string;
  };

beforeEach(() => {
  sendKakaoMock.mockReset();
  sendKakaoMock.mockResolvedValue({ ok: true });
  defaultRoomMock.mockReset();
  defaultRoomMock.mockReturnValue("기강 단톡방");
});

describe("send_kakao_notice — 권한", () => {
  it("비-admin 은 거부 — 발송·감사 없음, 공용 ToolDeniedError 하위", async () => {
    const { client, calls } = makeSupabase();

    const p = sendKakaoNotice(client, adminCtx({ is_admin: false }), { message: "공지" });
    await expect(p).rejects.toBeInstanceOf(SendKakaoNoticeDeniedError);
    await expect(
      sendKakaoNotice(client, adminCtx({ is_admin: false }), { message: "공지" }),
    ).rejects.toBeInstanceOf(ToolDeniedError);

    expect(sendKakaoMock).not.toHaveBeenCalled();
    expect(calls.auditInsert).toBeNull();
  });

  it("비-admin 은 dry_run 도 거부 — 방 이름을 미리보기로 흘리지 않는다", async () => {
    const { client } = makeSupabase();
    await expect(
      sendKakaoNotice(client, adminCtx({ is_admin: false }), { message: "공지", dry_run: true }),
    ).rejects.toBeInstanceOf(SendKakaoNoticeDeniedError);
    expect(defaultRoomMock).not.toHaveBeenCalled();
  });
});

describe("send_kakao_notice — dry_run", () => {
  it("보내지 않고 방·본문·태그·request_id 미리보기만 돌려준다", async () => {
    const { client, calls } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), {
      message: "이번 주 정기런은 잠수교에서 해요",
      mentions: [" 홍길동 ", "홍길동", "", "김철수"],
      dry_run: true,
    });

    expect(sendKakaoMock).not.toHaveBeenCalled();
    expect(calls.auditInsert).toBeNull();
    expect(r).toMatchObject({
      dry_run: true,
      status: "preview",
      room: "기강 단톡방",
      will_send: true,
      message: "이번 주 정기런은 잠수교에서 해요",
      mentions: ["홍길동", "김철수"], // 공백·빈 값·중복 정리
      failure: null,
      audit_id: null,
    });
    expect(r.request_id).toMatch(UUID_RE);
  });

  it("노티봇이 꺼진 환경이면 room=null·will_send=false 로 미리 알려 준다", async () => {
    defaultRoomMock.mockReturnValue(null);
    const { client } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), { message: "공지", dry_run: true });

    expect(r.room).toBeNull();
    expect(r.will_send).toBe(false);
    expect(sendKakaoMock).not.toHaveBeenCalled();
  });

  it("dry_run 에 준 request_id 는 그대로 돌려준다 — 확인 뒤 같은 id 로 보내게", async () => {
    const { client } = makeSupabase();
    const r = await sendKakaoNotice(client, adminCtx(), {
      message: "공지",
      request_id: "notice-2026-11-07",
      dry_run: true,
    });
    expect(r.request_id).toBe("notice-2026-11-07");
  });
});

describe("send_kakao_notice — request_id", () => {
  it("안 주면 서버가 만들어 발송에 쓰고 응답에 싣는다", async () => {
    const { client } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), { message: "공지" });

    expect(r.request_id).toMatch(UUID_RE);
    expect(sentOpts().requestId).toBe(r.request_id);
  });

  it("주면 그 값을 그대로 허브에 넘긴다(앞뒤 공백만 정리)", async () => {
    const { client } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), {
      message: "공지",
      request_id: "  notice-1  ",
    });

    expect(sentOpts().requestId).toBe("notice-1");
    expect(r.request_id).toBe("notice-1");
  });

  it("공백뿐인 request_id 는 거부 — 몰래 새 id 를 만들면 재전송이 중복이 된다", async () => {
    const { client } = makeSupabase();
    await expect(
      sendKakaoNotice(client, adminCtx(), { message: "공지", request_id: "   " }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(sendKakaoMock).not.toHaveBeenCalled();
  });
});

describe("send_kakao_notice — 입력 검증", () => {
  it("공백뿐인 본문은 보내지 않는다(이력에 failed 로 남지 않게)", async () => {
    const { client, calls } = makeSupabase();
    await expect(
      sendKakaoNotice(client, adminCtx(), { message: "  \n " }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(sendKakaoMock).not.toHaveBeenCalled();
    expect(calls.auditInsert).toBeNull();
  });

  it("4000자를 넘으면 거부", async () => {
    const { client } = makeSupabase();
    await expect(
      sendKakaoNotice(client, adminCtx(), { message: "가".repeat(4001) }),
    ).rejects.toThrow(/4000자/);
    expect(sendKakaoMock).not.toHaveBeenCalled();
  });

  it("태그가 20명을 넘으면 거부", async () => {
    const { client } = makeSupabase();
    const mentions = Array.from({ length: 21 }, (_, i) => `멤버${i}`);
    await expect(
      sendKakaoNotice(client, adminCtx(), { message: "공지", mentions }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("send_kakao_notice — 발송 결과", () => {
  it("sent: 출처 mcp_notice·보낸 사람·태그를 sendKakao 에 넘기고 감사행을 남긴다", async () => {
    const { client, calls } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), {
      message: "@홍길동 이번 주 벙 확인 부탁해요",
      mentions: ["홍길동"],
    });

    expect(sendKakaoMock).toHaveBeenCalledTimes(1);
    expect(sendKakaoMock.mock.calls[0][0]).toBe("@홍길동 이번 주 벙 확인 부탁해요");
    const opts = sentOpts();
    expect(opts.source).toEqual({ type: "mcp_notice", id: r.audit_id });
    expect(opts.actorMemId).toBe(ACTOR_ID);
    expect(opts.mentions).toEqual(["홍길동"]);
    // 방은 넘기지 않는다 — sendKakao 가 환경 설정(KAKAO_ROOM_ID → KAKAO_ROOM)으로 정한다.
    expect(opts.room).toBeUndefined();

    expect(r).toMatchObject({ dry_run: false, status: "sent", room: "기강 단톡방", failure: null });

    const audit = calls.auditInsert as Record<string, unknown>;
    expect(audit.audit_id).toBe(r.audit_id);
    expect(audit.actor_mem_id).toBe(ACTOR_ID);
    expect(audit.team_id).toBe(TEAM_ID);
    expect(audit.tool_nm).toBe("send_kakao_notice");
    expect(audit.params_json).toMatchObject({ status: "sent", request_id: r.request_id });
  });

  it("태그가 없으면 mentions 옵션을 싣지 않는다", async () => {
    const { client } = makeSupabase();
    await sendKakaoNotice(client, adminCtx(), { message: "공지", mentions: [] });
    expect(sentOpts().mentions).toBeUndefined();
  });

  it("duplicate: 허브가 같은 request_id 를 이미 받아 둔 건 — sent 와 구분해 돌려준다(#631)", async () => {
    sendKakaoMock.mockResolvedValue({ ok: true, duplicate: true });
    const { client, calls } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), {
      message: "공지",
      request_id: "hgworld-test-20261107-01",
    });

    expect(r.status).toBe("duplicate");
    expect(r.failure).toBeNull();
    expect(r.request_id).toBe("hgworld-test-20261107-01");
    expect(sendKakaoMock).toHaveBeenCalledTimes(1);
    expect((calls.auditInsert?.params_json as Record<string, unknown>).status).toBe("duplicate");
  });

  it("skipped: 노티봇 미설정 환경 — 던지지 않고 skipped 로 돌려준다", async () => {
    sendKakaoMock.mockResolvedValue({ ok: false, skipped: "disabled" });
    defaultRoomMock.mockReturnValue(null);
    const { client, calls } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), { message: "공지" });

    expect(r.status).toBe("skipped");
    expect(r.failure).toBeNull();
    expect(r.room).toBeNull();
    expect((calls.auditInsert?.params_json as Record<string, unknown>).status).toBe("skipped");
  });

  it("failed: 실패 분류를 싣고 재시도하지 않는다", async () => {
    sendKakaoMock.mockResolvedValue({
      ok: false,
      failure: {
        name: "NotiBotApiError",
        message: "mention name unknown",
        retryable: false,
        status: 422,
        code: "mention_name_unknown",
      },
    });
    const { client, calls } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), {
      message: "공지",
      mentions: ["없는사람"],
    });

    expect(sendKakaoMock).toHaveBeenCalledTimes(1); // 재시도 없음
    expect(r.status).toBe("failed");
    expect(r.failure).toEqual({
      name: "NotiBotApiError",
      code: "mention_name_unknown",
      http_status: 422,
      message: "mention name unknown",
      retryable: false,
    });
    expect(r.request_id).toMatch(UUID_RE);
    expect(calls.auditInsert?.params_json).toMatchObject({
      status: "failed",
      failure_code: "mention_name_unknown",
    });
  });

  it("타임아웃(retryable)도 한 번만 부른다 — 다시 보내기는 사람이 같은 request_id 로", async () => {
    sendKakaoMock.mockResolvedValue({
      ok: false,
      failure: { name: "NotiBotTimeoutError", message: "timeout", retryable: true, timeoutMs: 10000 },
    });
    const { client } = makeSupabase();

    const r = await sendKakaoNotice(client, adminCtx(), { message: "공지", request_id: "n-1" });

    expect(sendKakaoMock).toHaveBeenCalledTimes(1);
    expect(r.failure).toMatchObject({ name: "NotiBotTimeoutError", retryable: true, code: null });
    expect(r.request_id).toBe("n-1");
  });

  it("감사 기록이 실패해도 발송 결과는 그대로 돌려준다(이미 나갔다)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeSupabase({ auditErr: { message: "boom" } });

    const r = await sendKakaoNotice(client, adminCtx(), { message: "공지" });

    expect(r.status).toBe("sent");
  });
});
