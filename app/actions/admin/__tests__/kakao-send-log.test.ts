import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/kakao/notify", () => ({ sendKakao: vi.fn() }));
vi.mock("@/lib/queries/request-team", () => ({ getRequestTeamContext: async () => ({ teamId: "team-1" }) }));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdminOrThrow: async (fn: any) => fn({ member: { id: "admin-1" } }),
}));
vi.mock("@/lib/supabase/admin", () => {
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: async () => h.result,
    eq: () => builder,
    single: async () => h.result,
  };
  return { createUntypedAdminClient: () => ({ from: () => builder }) };
});

import { sendKakao } from "@/lib/kakao/notify";

import { getKakaoSendLogs, resendKakao } from "@/app/actions/admin/kakao-send-log";

describe("getKakaoSendLogs", () => {
  beforeEach(() => {
    h.result = { data: [], error: null };
  });

  it("이력 테이블이 이 환경 DB 에 아직 없으면 던지지 않고 tableMissing 으로 알린다", async () => {
    h.result = {
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.kakao_send_hist' in the schema cache" },
    };

    await expect(getKakaoSendLogs()).resolves.toEqual({ logs: [], tableMissing: true });
  });

  it("Postgres 의 undefined_table(42P01) 도 같은 경우로 본다", async () => {
    h.result = { data: null, error: { code: "42P01", message: "relation does not exist" } };

    await expect(getKakaoSendLogs()).resolves.toEqual({ logs: [], tableMissing: true });
  });

  it("그 밖의 오류는 지금처럼 던진다 — 조용히 빈 목록을 보여주면 장애를 가린다", async () => {
    h.result = { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };

    await expect(getKakaoSendLogs()).rejects.toThrow("발송 이력을 불러오지 못했어요");
  });

  it("정상이면 행을 돌려준다", async () => {
    h.result = {
      data: [
        {
          send_id: "s1", room_nm: "기강", msg_txt: "안녕", request_id: null, status: "success",
          err_name: null, err_msg: null, http_status: null, err_code: null, retryable: false,
          src_type: null, src_id: null, resend_yn: false, crt_at: "2026-10-19T00:00:00Z",
        },
      ],
      error: null,
    };

    const res = await getKakaoSendLogs();
    expect(res.tableMissing).toBe(false);
    expect(res.logs.map((l) => l.sendId)).toEqual(["s1"]);
  });
});


describe("resendKakao — 중복 발송 방지", () => {
  beforeEach(() => {
    vi.mocked(sendKakao).mockReset();
    h.result = { data: {
      send_id: "s1", room_nm: "4b492fd2-bb84-43be-a663-4e5f087ffb2e",
      msg_txt: "안녕", request_id: "stable-request", status: "failed", retryable: true,
    }, error: null };
  });

  it("응답 유실 후 다시 보내도 저장된 멱등 키와 고정 방 ID 를 유지한다", async () => {
    vi.mocked(sendKakao).mockResolvedValue({ ok: true });
    const result = await resendKakao("s1");
    expect(sendKakao).toHaveBeenCalledWith("안녕", expect.objectContaining({
      teamId: "team-1",
      room: "4b492fd2-bb84-43be-a663-4e5f087ffb2e", requestId: "stable-request", resend: true,
    }));
    expect(result.message).toContain("접수");
  });

  it("멱등 키가 없는 과거 실패 이력은 새 키로 재발송하지 않는다", async () => {
    (h.result.data as Record<string, unknown>).request_id = null;
    await expect(resendKakao("s1")).rejects.toThrow("중복 여부");
    expect(sendKakao).not.toHaveBeenCalled();
  });

  it("중복(duplicate) 이력은 다시 보내지 않는다 — 허브가 이미 받아 둔 건이다(#631)", async () => {
    (h.result.data as Record<string, unknown>).status = "duplicate";
    await expect(resendKakao("s1")).rejects.toThrow("이미 같은 요청");
    expect(sendKakao).not.toHaveBeenCalled();
  });

  it("다시 보냈는데 허브가 중복이라 하면 '새로 안 보냈다'고 말한다 — 실은 첫 요청이 접수돼 있었다", async () => {
    vi.mocked(sendKakao).mockResolvedValue({ ok: true, duplicate: true });
    const result = await resendKakao("s1");
    expect(result).toEqual({ ok: true, message: expect.stringContaining("새로 보내지 않았어요") });
  });
});
