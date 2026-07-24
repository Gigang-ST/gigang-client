import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { hashToken, resolveOperator, TOKEN_PREFIX } from "@/lib/mcp/auth";
import {
  issueMcpToken,
  listMcpTokens,
  McpTokenNotFoundError,
  revokeMcpToken,
} from "@/lib/mcp/issue-token";
import type { Database } from "@/lib/supabase/database.types";

/**
 * SG-03 PAT 발급/목록/폐기 검증(스펙 §3.1, AC-07/08/09).
 *
 * `lib/mcp/issue-token.ts`는 `lib/mcp/auth.ts`만 import 하고 `server-only` 체인
 * (`admin.ts`)을 import 하지 않으므로 vitest server-only 함정([[troubleshooting/vitest-server-only-trap]])에
 * 걸리지 않는다.
 *
 * 핵심 검증(AC-07/09): `issueMcpToken`이 저장한 `token_hash`가 `hashToken(원문)`과 정확히 일치해야
 * 발급 직후 `resolveOperator`로 로그인할 수 있다 — 두 모듈이 해시 함수를 공유하는지를 실제로
 * 왕복시켜 증명한다(발급 → resolveOperator 성공 → 폐기 → resolveOperator 실패).
 */

type Resp = { data: unknown; error: unknown };

/** insert().select().single() 체인을 흉내내는 최소 빌더. */
function makeInsertBuilder(onInsert: (row: Record<string, unknown>) => Resp) {
  let captured: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      captured = row;
      return builder;
    },
    select: () => builder,
    single: async () => onInsert(captured),
  };
  return builder;
}

/** select().eq().order() 체인(단순 목록 조회, `await` 가능하도록 thenable 구현). */
function makeListBuilder(resp: Resp) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (v: Resp) => void) => resolve(resp),
  };
  return builder;
}

/** update().eq()*.is().select().maybeSingle() 체인. eq 호출 인자를 관측한다. */
function makeUpdateBuilder(resp: Resp, onEq?: (key: string, val: unknown) => void) {
  const builder: Record<string, unknown> = {
    update: () => builder,
    eq: (key: string, val: unknown) => {
      onEq?.(key, val);
      return builder;
    },
    is: () => builder,
    select: () => builder,
    maybeSingle: async () => resp,
  };
  return builder;
}

const MEM_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_MEM_ID = "99999999-9999-9999-9999-999999999999";
const TEAM_ID = "22222222-2222-2222-2222-222222222222";
const TOKEN_ID = "33333333-3333-3333-3333-333333333333";

describe("issueMcpToken — AC-07 해시 저장", () => {
  it("gmcp_ 접두사 원문 토큰을 생성하고, 저장하는 token_hash는 hashToken(원문)과 일치한다", async () => {
    let insertedHash: string | undefined;
    const client = {
      from: () =>
        makeInsertBuilder((row) => {
          insertedHash = row.token_hash as string;
          return {
            data: {
              token_id: TOKEN_ID,
              created_at: "2026-07-24T00:00:00.000Z",
              label: row.label,
            },
            error: null,
          };
        }),
    } as unknown as SupabaseClient<Database>;

    const result = await issueMcpToken(client, {
      memId: MEM_ID,
      teamId: TEAM_ID,
      label: "내 노트북",
    });

    expect(result.token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(result.token_id).toBe(TOKEN_ID);
    expect(result.label).toBe("내 노트북");
    // 핵심: 저장된 해시가 auth.ts의 hashToken과 정확히 일치 — 검증 로직과 공유.
    expect(insertedHash).toBe(hashToken(result.token));
  });

  it("원문 토큰 자체는 반환값에서만 노출되고 해시에는 포함되지 않는다(단방향)", async () => {
    const client = {
      from: () =>
        makeInsertBuilder((row) => ({
          data: { token_id: TOKEN_ID, created_at: "2026-07-24T00:00:00.000Z", label: row.label },
          error: null,
        })),
    } as unknown as SupabaseClient<Database>;

    const result = await issueMcpToken(client, { memId: MEM_ID, teamId: TEAM_ID, label: null });
    expect(hashToken(result.token)).not.toContain(result.token);
  });

  it("insert 에러 시 예외를 던진다", async () => {
    const client = {
      from: () => makeInsertBuilder(() => ({ data: null, error: { message: "boom" } })),
    } as unknown as SupabaseClient<Database>;

    await expect(
      issueMcpToken(client, { memId: MEM_ID, teamId: TEAM_ID, label: null }),
    ).rejects.toBeTruthy();
  });
});

describe("발급 → resolveOperator 왕복 (AC-09)", () => {
  it("발급 직후 원문 토큰으로 resolveOperator 인증에 성공한다", async () => {
    let storedHash = "";
    const issueClient = {
      from: () =>
        makeInsertBuilder((row) => {
          storedHash = row.token_hash as string;
          return {
            data: { token_id: TOKEN_ID, created_at: "2026-07-24T00:00:00.000Z", label: row.label },
            error: null,
          };
        }),
    } as unknown as SupabaseClient<Database>;

    const issued = await issueMcpToken(issueClient, {
      memId: MEM_ID,
      teamId: TEAM_ID,
      label: "테스트 기기",
    });
    expect(storedHash).toBe(hashToken(issued.token));

    // resolveOperator 용 스텁 — 위에서 저장된 해시를 그대로 가진 활성 토큰 행을 반환한다.
    const authMap: Record<string, Resp> = {
      mcp_token_rel: {
        data: {
          token_id: TOKEN_ID,
          mem_id: MEM_ID,
          team_id: TEAM_ID,
          expires_at: null,
          revoked_at: null,
        },
        error: null,
      },
      team_mem_rel: { data: { mem_st_cd: "active", team_role_cd: "member" }, error: null },
      mem_mst: { data: { mem_nm: "테스트 멤버" }, error: null },
    };
    const authClient = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          update: () => builder,
          maybeSingle: async () => authMap[table],
        };
        return builder;
      },
    } as unknown as SupabaseClient<Database>;

    const ctx = await resolveOperator(issued.token, authClient);
    expect(ctx).toEqual({
      mem_id: MEM_ID,
      team_id: TEAM_ID,
      is_admin: false,
      mem_nm: "테스트 멤버",
    });
  });

  it("폐기된 토큰이면(revoked_at 필터로 조회 결과 없음) resolveOperator가 null을 반환한다", async () => {
    const client = {
      from: () => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          // 실제 DB의 `.is("revoked_at", null)` 필터가 폐기된 행을 걸러내는 효과를 스텁으로 재현.
          is: () => builder,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return builder;
      },
    } as unknown as SupabaseClient<Database>;

    const ctx = await resolveOperator(`${TOKEN_PREFIX}${"a".repeat(43)}`, client);
    expect(ctx).toBeNull();
  });
});

describe("listMcpTokens — AC-08 본인 목록", () => {
  it("token_hash를 포함하지 않고 revoked 플래그를 계산해 반환한다", async () => {
    const client = {
      from: () =>
        makeListBuilder({
          data: [
            {
              token_id: "a",
              label: "폰",
              created_at: "2026-07-24T00:00:00.000Z",
              last_used_at: null,
              revoked_at: null,
            },
            {
              token_id: "b",
              label: null,
              created_at: "2026-07-20T00:00:00.000Z",
              last_used_at: "2026-07-23T00:00:00.000Z",
              revoked_at: "2026-07-23T01:00:00.000Z",
            },
          ],
          error: null,
        }),
    } as unknown as SupabaseClient<Database>;

    const tokens = await listMcpTokens(client, MEM_ID);
    expect(tokens).toEqual([
      { token_id: "a", label: "폰", created_at: "2026-07-24T00:00:00.000Z", last_used_at: null, revoked: false },
      {
        token_id: "b",
        label: null,
        created_at: "2026-07-20T00:00:00.000Z",
        last_used_at: "2026-07-23T00:00:00.000Z",
        revoked: true,
      },
    ]);
    for (const t of tokens) {
      expect(Object.keys(t)).not.toContain("token_hash");
    }
  });
});

describe("revokeMcpToken — 본인 스코프 강제", () => {
  it("본인 토큰이면 mem_id eq 필터로 스코프해 폐기에 성공한다", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const client = {
      from: () =>
        makeUpdateBuilder({ data: { token_id: TOKEN_ID }, error: null }, (k, v) =>
          eqCalls.push([k, v]),
        ),
    } as unknown as SupabaseClient<Database>;

    await revokeMcpToken(client, MEM_ID, TOKEN_ID);

    expect(eqCalls).toContainEqual(["token_id", TOKEN_ID]);
    expect(eqCalls).toContainEqual(["mem_id", MEM_ID]);
  });

  it("남의 토큰이거나 존재하지 않으면(쿼리 결과 0행) McpTokenNotFoundError를 던진다", async () => {
    const client = {
      from: () => makeUpdateBuilder({ data: null, error: null }),
    } as unknown as SupabaseClient<Database>;

    await expect(revokeMcpToken(client, OTHER_MEM_ID, TOKEN_ID)).rejects.toBeInstanceOf(
      McpTokenNotFoundError,
    );
  });

  it("이미 폐기된 토큰도 동일하게(0행) McpTokenNotFoundError로 처리한다", async () => {
    const client = {
      from: () => makeUpdateBuilder({ data: null, error: null }),
    } as unknown as SupabaseClient<Database>;

    await expect(revokeMcpToken(client, MEM_ID, TOKEN_ID)).rejects.toBeInstanceOf(
      McpTokenNotFoundError,
    );
  });
});
