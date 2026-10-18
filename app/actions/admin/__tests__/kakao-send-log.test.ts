import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/kakao/notify", () => ({ sendKakao: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdminOrThrow: async (fn: any) => fn(),
}));
vi.mock("@/lib/supabase/admin", () => {
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: async () => h.result,
  };
  return { createUntypedAdminClient: () => ({ from: () => builder }) };
});

import { getKakaoSendLogs } from "@/app/actions/admin/kakao-send-log";

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
