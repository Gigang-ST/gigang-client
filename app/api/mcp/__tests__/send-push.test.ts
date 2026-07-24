import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * SG-05 send_push 검증(M-02 G-1·G-2 + AC-16·AC-17·AC-18, 스펙 §4·§6·§8).
 *
 * ⚠️ 실제 크루원에게 푸시 발송 금지 — insertNotiMany 는 vi.mock 으로 완전 대체한다.
 *   send-push.ts 는 insertNotiMany(→ admin.ts → "server-only") 를 정적 import 하므로,
 *   이 mock 이 없으면 vitest 가 server-only 를 로드하다 실패한다
 *   ([[troubleshooting/vitest-server-only-trap]]). mock 은 발송을 막고 호출 인자를 관측한다.
 */

// vi.mock 팩토리는 파일 최상단으로 hoist 되므로, mock 함수도 vi.hoisted 로 함께 끌어올린다.
const { insertNotiManyMock } = vi.hoisted(() => ({
  insertNotiManyMock: vi.fn(async (_input: unknown) => {}),
}));
vi.mock("@/lib/notifications/insert-noti", () => ({
  insertNotiMany: insertNotiManyMock,
}));

// mock 선언 이후에 대상 모듈을 import(vi.mock 은 hoist 되므로 순서 무관하나 명시적으로 정적 import).
import { sendPush, SendPushDeniedError } from "@/lib/mcp/send-push";

const TEAM_ID = "22222222-2222-2222-2222-222222222222";
const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";
const OTHER_TEAM_MEM = "bbbbbbbb-0000-4000-8000-000000000009"; // 타 팀/비활성 → 스코프 조회에서 미반환

function adminCtx(overrides: Partial<OperatorContext> = {}): OperatorContext {
  return {
    mem_id: ACTOR_ID,
    team_id: TEAM_ID,
    is_admin: true,
    mem_nm: "관리자",
    ...overrides,
  };
}

/**
 * 최소 Supabase 스텁.
 * - team_mem_rel: select().eq()*.in() 을 await 하면 `validMemberIds` 만 반환(팀 스코프 조회 결과).
 *   → 요청 id 중 여기 없는 것(타 팀·비활성·미존재)은 자연히 발송 대상에서 제외된다.
 * - mcp_audit_log: insert(row) 로 감사행을 관측한다.
 */
function makeSupabase(opts: {
  validMemberIds: string[];
  memErr?: unknown;
  auditErr?: unknown;
}) {
  const calls: {
    teamScopeIn: string[] | null;
    auditInsert: Record<string, unknown> | null;
  } = { teamScopeIn: null, auditInsert: null };

  const teamMemBuilder: Record<string, unknown> = {
    select: () => teamMemBuilder,
    eq: () => teamMemBuilder,
    in: (_col: string, ids: string[]) => {
      calls.teamScopeIn = ids;
      return teamMemBuilder;
    },
    // thenable: await 시 스코프 조회 결과 반환.
    then: (resolve: (v: unknown) => void) =>
      resolve({
        data: opts.memErr ? null : opts.validMemberIds.map((mem_id) => ({ mem_id })),
        error: opts.memErr ?? null,
      }),
  };

  const auditBuilder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      calls.auditInsert = row;
      return auditBuilder;
    },
    // insert 는 await 로 { error } 만 확인한다(select().single() 미사용).
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: opts.auditErr ?? null }),
  };

  const client = {
    from: (table: string) =>
      table === "mcp_audit_log" ? auditBuilder : teamMemBuilder,
  } as unknown as SupabaseClient<Database>;

  return { client, calls };
}

beforeEach(() => {
  insertNotiManyMock.mockClear();
});

describe("send_push — AC-16 admin 발송(올바른 team_id·검증된 memIds) + 감사행", () => {
  it("admin ctx: insertNotiMany 를 ctx.team_id·검증된 대상으로 호출하고 감사행을 남긴다", async () => {
    const { client, calls } = makeSupabase({ validMemberIds: [M1, M2] });

    const result = await sendPush(client, adminCtx(), {
      memberIds: [M1, M2],
      title: "정기런 공지",
      message: "토요일 7시 한강 집결",
    });

    // insertNotiMany 정확히 1회, ctx.team_id·검증된 memIds·adm_cust 타입으로.
    expect(insertNotiManyMock).toHaveBeenCalledTimes(1);
    const arg = insertNotiManyMock.mock.calls[0][0] as {
      teamId: string;
      memIds: string[];
      notiTypeEnm: string;
      notiNm: string;
      notiCont: string;
      batchId: string;
    };
    expect(arg.teamId).toBe(TEAM_ID);
    expect(arg.memIds).toEqual([M1, M2]);
    expect(arg.notiTypeEnm).toBe("adm_cust"); // 기존 범용 타입 재사용(NOTI_ICON 등록됨)
    expect(arg.notiNm).toBe("정기런 공지");
    expect(arg.notiCont).toBe("토요일 7시 한강 집결");
    expect(typeof arg.batchId).toBe("string");

    // 반환: sent_cnt·audit_id.
    expect(result.sent_cnt).toBe(2);
    expect(result.audit_id).toEqual(expect.any(String));

    // 감사행 1행 기록.
    expect(calls.auditInsert).not.toBeNull();
    expect(calls.auditInsert?.audit_id).toBe(result.audit_id);
  });
});

describe("send_push — AC-17 non-admin 거부(발송 0·감사 없음)", () => {
  it("member ctx: SendPushDeniedError, insertNotiMany 미호출, 감사행 없음", async () => {
    const { client, calls } = makeSupabase({ validMemberIds: [M1, M2] });

    await expect(
      sendPush(client, adminCtx({ is_admin: false }), {
        memberIds: [M1, M2],
        title: "공지",
        message: "내용",
      }),
    ).rejects.toBeInstanceOf(SendPushDeniedError);

    expect(insertNotiManyMock).not.toHaveBeenCalled();
    expect(calls.auditInsert).toBeNull();
    expect(calls.teamScopeIn).toBeNull(); // admin 게이트에서 조회 이전에 차단
  });
});

describe("send_push — AC-18 감사행 필드(actor·team·tool·수신자·params 마스킹)", () => {
  it("성공 발송 시 감사행에 actor_mem_id·team_id·tool_nm·수신자·시각 기록", async () => {
    const { client, calls } = makeSupabase({ validMemberIds: [M1] });

    const result = await sendPush(client, adminCtx(), {
      memberIds: [M1],
      title: "제목",
      message: "본문",
    });

    const audit = calls.auditInsert as Record<string, unknown>;
    expect(audit.actor_mem_id).toBe(ACTOR_ID);
    expect(audit.team_id).toBe(TEAM_ID);
    expect(audit.tool_nm).toBe("send_push");
    expect(audit.audit_id).toBe(result.audit_id);
    expect(typeof audit.result_summary).toBe("string");

    // params_json: 수신자 mem_id 기록 + 민감정보(연락처·계좌) 절대 미포함(M-03).
    const params = audit.params_json as Record<string, unknown>;
    expect(params.recipient_mem_ids).toEqual([M1]);
    expect(params.sent_cnt).toBe(1);
    const serialized = JSON.stringify(audit);
    for (const banned of ["phone_no", "email_addr", "bank_nm", "bank_acct_no"]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("send_push — 팀 스코프 안전장치(교차 팀/비활성 제외)", () => {
  it("타 팀·비활성 mem_id 는 발송 대상에서 제외(우리 팀 활성 멤버에게만 발송)", async () => {
    // 요청엔 M1(유효) + OTHER_TEAM_MEM(타 팀/비활성) 이 섞여 있으나, 스코프 조회는 M1 만 반환.
    const { client, calls } = makeSupabase({ validMemberIds: [M1] });

    const result = await sendPush(client, adminCtx(), {
      memberIds: [M1, OTHER_TEAM_MEM],
      title: "공지",
      message: "내용",
    });

    // 스코프 조회에는 요청 전체가 전달되지만, 발송은 유효 대상만.
    expect(calls.teamScopeIn).toEqual([M1, OTHER_TEAM_MEM]);
    const arg = insertNotiManyMock.mock.calls[0][0] as { memIds: string[] };
    expect(arg.memIds).toEqual([M1]); // 타 팀 id 제외
    expect(result.sent_cnt).toBe(1);
    const params = (calls.auditInsert as Record<string, unknown>)
      .params_json as Record<string, unknown>;
    expect(params.recipient_mem_ids).toEqual([M1]);
    expect(params.requested_cnt).toBe(2);
  });

  it("유효 대상이 0명이면(모두 타 팀/비활성) 발송하지 않고 ToolInputError·감사 없음", async () => {
    const { client, calls } = makeSupabase({ validMemberIds: [] });

    await expect(
      sendPush(client, adminCtx(), {
        memberIds: [OTHER_TEAM_MEM],
        title: "공지",
        message: "내용",
      }),
    ).rejects.toBeInstanceOf(ToolInputError);

    expect(insertNotiManyMock).not.toHaveBeenCalled();
    expect(calls.auditInsert).toBeNull();
  });
});
