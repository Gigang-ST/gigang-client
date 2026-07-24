import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { resolveOperator, type OperatorContext } from "@/lib/mcp/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 기강 운영 MCP — Streamable HTTP 엔드포인트.
 *
 * 라우트 위치가 `app/api/mcp/[transport]/route.ts` 이므로 basePath 는 `/api/mcp`,
 * 클라이언트 접속 URL 은 `/api/mcp/mcp` 이다(mcp-handler 규약: endpoint = basePath + "/mcp").
 *
 * 인증: `withMcpAuth`(required) 가 앞단에서 `Authorization: Bearer <PAT>` 를 검사한다.
 *   토큰 없음/무효/폐기/만료/비활성 멤버 → 401(스펙 §7). 성공 시 operator 컨텍스트를
 *   `AuthInfo.extra` 로 각 도구에 주입한다. 서버 전용 service-role 클라이언트만 사용하며
 *   토큰 해시·시크릿은 어떤 응답에도 노출하지 않는다.
 *
 * 이번 단계(SG-02)는 health 도구 `whoami` 하나만 노출한다. 6개 조회 도구·send_push 는
 * 후속 sub-goal 에서 추가한다.
 */
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "whoami",
      {
        title: "내 신원 확인",
        description:
          "인증된 운영자의 팀 스코프 신원(mem_id, team_id, is_admin, 이름)을 반환하는 health 도구입니다.",
        inputSchema: {},
      },
      async (_args, extra) => {
        const ctx = extra.authInfo?.extra as OperatorContext | undefined;
        if (!ctx) {
          // withMcpAuth(required)가 미인증을 401로 이미 차단하므로 도달하지 않는 방어선.
          return {
            content: [{ type: "text", text: "인증 정보를 확인할 수 없습니다." }],
            isError: true,
          };
        }
        const identity = {
          mem_id: ctx.mem_id,
          team_id: ctx.team_id,
          is_admin: ctx.is_admin,
          mem_nm: ctx.mem_nm,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(identity) }],
        };
      },
    );
  },
  {
    serverInfo: { name: "gigang-ops-mcp", version: "0.1.0" },
  },
  {
    basePath: "/api/mcp",
    disableSse: true,
    verboseLogs: false,
  },
);

/**
 * Bearer 토큰을 검증해 operator 컨텍스트를 `AuthInfo.extra` 로 실어 반환한다.
 * 검증 실패(토큰 없음 포함)는 `undefined` → withMcpAuth(required)가 401 처리.
 * service-role 클라이언트는 여기(서버)에서만 생성·사용한다.
 */
const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const supabase = createAdminClient();
    const ctx = await resolveOperator(bearerToken, supabase);
    if (!ctx) return undefined;
    return {
      token: bearerToken,
      clientId: ctx.mem_id,
      scopes: ctx.is_admin ? ["operator", "admin"] : ["operator"],
      extra: ctx as unknown as Record<string, unknown>,
    };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST };
