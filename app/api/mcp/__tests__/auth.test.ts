import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { hashToken, resolveOperator, TOKEN_PREFIX } from "@/lib/mcp/auth";

/**
 * SG-02 auth 검증 — 스펙 §3.2 / 권한 매트릭스 §6 G-3~G-5, AC-04·AC-05.
 *
 * resolveOperator 는 순수 검증 함수라 service-role 클라이언트를 주입해 테스트한다.
 * lib/mcp/auth.ts 는 `server-only` 체인(insert-noti 등)을 import 하지 않으므로
 * vitest server-only 함정([[troubleshooting/vitest-server-only-trap]])에 걸리지 않는다 —
 * route.ts(→ admin.ts → "server-only")는 import 하지 않는 것이 핵심.
 */

type Resp = { data: unknown; error: unknown };

/**
 * 최소 Supabase 스텁. from(table) 별로 maybeSingle() 응답을 미리 지정한다.
 * mcp_token_rel 은 select(1단계)·update(best-effort) 양쪽에 쓰이나,
 * update 경로는 maybeSingle 을 호출하지 않으므로 응답 라우팅이 겹치지 않는다.
 */
function makeSupabase(responses: { token?: Resp; rel?: Resp; mem?: Resp }) {
  const map: Record<string, Resp> = {
    mcp_token_rel: responses.token ?? { data: null, error: null },
    team_mem_rel: responses.rel ?? { data: null, error: null },
    mem_mst: responses.mem ?? { data: null, error: null },
  };
  const state = { updateCalled: false };

  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      update: () => {
        state.updateCalled = true;
        return builder;
      },
      maybeSingle: async () => map[table],
    };
    return builder;
  };

  const client = {
    from: (table: string) => makeBuilder(table),
  } as unknown as SupabaseClient<Database>;

  return { client, state };
}

const VALID_TOKEN = `${TOKEN_PREFIX}${"a".repeat(43)}`;
const MEM_ID = "11111111-1111-1111-1111-111111111111";
const TEAM_ID = "22222222-2222-2222-2222-222222222222";

const activeTokenRow = {
  data: {
    token_id: "33333333-3333-3333-3333-333333333333",
    mem_id: MEM_ID,
    team_id: TEAM_ID,
    expires_at: null,
    revoked_at: null,
  },
  error: null,
};

describe("hashToken", () => {
  it("동일 입력에 동일 sha256 hex(64자)를 낸다", () => {
    const h1 = hashToken(VALID_TOKEN);
    const h2 = hashToken(VALID_TOKEN);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("원문 토큰이 해시에 포함되지 않는다(단방향)", () => {
    expect(hashToken(VALID_TOKEN)).not.toContain(VALID_TOKEN);
  });
});

describe("resolveOperator — AC-04 거부(→ 라우트 401)", () => {
  it("G-3: 토큰이 없으면 null", async () => {
    const { client } = makeSupabase({});
    expect(await resolveOperator(undefined, client)).toBeNull();
    expect(await resolveOperator(null, client)).toBeNull();
    expect(await resolveOperator("", client)).toBeNull();
  });

  it("G-3: 형식오류(gmcp_ 접두사 아님)면 DB 조회 없이 null", async () => {
    const { client } = makeSupabase({ token: activeTokenRow });
    expect(await resolveOperator("Bearer something", client)).toBeNull();
    expect(await resolveOperator("randomtoken", client)).toBeNull();
  });

  it("G-4: 미존재/폐기 토큰(조회 결과 없음)이면 null", async () => {
    // revoked_at is null 필터로 폐기 토큰은 애초에 조회되지 않음 → data:null 로 표현
    const { client } = makeSupabase({ token: { data: null, error: null } });
    expect(await resolveOperator(VALID_TOKEN, client)).toBeNull();
  });

  it("G-4: 만료(expires_at 과거) 토큰이면 null", async () => {
    const { client } = makeSupabase({
      token: {
        data: {
          token_id: "44444444-4444-4444-4444-444444444444",
          mem_id: MEM_ID,
          team_id: TEAM_ID,
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          revoked_at: null,
        },
        error: null,
      },
      rel: { data: { mem_st_cd: "active", team_role_cd: "member" }, error: null },
    });
    expect(await resolveOperator(VALID_TOKEN, client)).toBeNull();
  });

  it("G-5: 팀 멤버십이 없으면 null", async () => {
    const { client } = makeSupabase({
      token: activeTokenRow,
      rel: { data: null, error: null },
    });
    expect(await resolveOperator(VALID_TOKEN, client)).toBeNull();
  });

  it("G-5: 비활성(mem_st_cd != active) 멤버 토큰이면 null", async () => {
    for (const st of ["inactive", "left"]) {
      const { client } = makeSupabase({
        token: activeTokenRow,
        rel: { data: { mem_st_cd: st, team_role_cd: "member" }, error: null },
      });
      expect(await resolveOperator(VALID_TOKEN, client)).toBeNull();
    }
  });

  it("토큰 조회 에러 시 null(사유 비노출)", async () => {
    const { client } = makeSupabase({
      token: { data: null, error: { message: "boom" } },
    });
    expect(await resolveOperator(VALID_TOKEN, client)).toBeNull();
  });
});

describe("resolveOperator — AC-05 유효 토큰 → ctx 해석", () => {
  it("active 멤버면 { mem_id, team_id, is_admin, mem_nm } 반환", async () => {
    const { client, state } = makeSupabase({
      token: activeTokenRow,
      rel: { data: { mem_st_cd: "active", team_role_cd: "member" }, error: null },
      mem: { data: { mem_nm: "홍길동" }, error: null },
    });
    const ctx = await resolveOperator(VALID_TOKEN, client);
    expect(ctx).toEqual({
      mem_id: MEM_ID,
      team_id: TEAM_ID,
      is_admin: false,
      mem_nm: "홍길동",
    });
    // last_used_at 갱신(best-effort)이 시도됨
    expect(state.updateCalled).toBe(true);
  });

  it("owner/admin 역할은 is_admin=true, 그 외는 false", async () => {
    const cases: Array<[string, boolean]> = [
      ["owner", true],
      ["admin", true],
      ["member", false],
    ];
    for (const [role, expected] of cases) {
      const { client } = makeSupabase({
        token: activeTokenRow,
        rel: { data: { mem_st_cd: "active", team_role_cd: role }, error: null },
        mem: { data: { mem_nm: "테스트" }, error: null },
      });
      const ctx = await resolveOperator(VALID_TOKEN, client);
      expect(ctx?.is_admin).toBe(expected);
    }
  });

  it("반환 ctx 는 팀 스코프 신원만 — 민감정보 키(phone/email/bank) 없음", async () => {
    const { client } = makeSupabase({
      token: activeTokenRow,
      rel: { data: { mem_st_cd: "active", team_role_cd: "admin" }, error: null },
      mem: { data: { mem_nm: "관리자" }, error: null },
    });
    const ctx = await resolveOperator(VALID_TOKEN, client);
    expect(ctx).not.toBeNull();
    const keys = Object.keys(ctx ?? {});
    expect(keys.sort()).toEqual(["is_admin", "mem_id", "mem_nm", "team_id"]);
    for (const banned of ["phone_no", "email_addr", "bank_nm", "bank_acct_no"]) {
      expect(keys).not.toContain(banned);
    }
  });

  it("이름 조회 실패해도 인증은 성립(mem_nm 빈 문자열)", async () => {
    const { client } = makeSupabase({
      token: activeTokenRow,
      rel: { data: { mem_st_cd: "active", team_role_cd: "member" }, error: null },
      mem: { data: null, error: null },
    });
    const ctx = await resolveOperator(VALID_TOKEN, client);
    expect(ctx?.mem_nm).toBe("");
    expect(ctx?.mem_id).toBe(MEM_ID);
  });
});
