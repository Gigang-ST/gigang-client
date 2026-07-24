import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import { resolveOperator, type OperatorContext } from "@/lib/mcp/auth";
import {
  ToolInputError,
  getMemberProfile,
  listGatheringNonAttendees,
  listMembersAttendance,
  listPushStatus,
  listRecentMembers,
  listTodayGatherings,
} from "@/lib/mcp/queries";
import { createAdminClient } from "@/lib/supabase/admin";

/** MCP 도구 응답 도우미 — 사실 payload를 text JSON 으로 감싼다. */
function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

/** 안전 에러 응답 — 스택·시크릿·SQL 비노출(스펙 §7). */
function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/**
 * 읽기 도구 공통 실행 래퍼. operator ctx(팀 스코프 신원)를 꺼내 service-role 클라이언트를
 * 만들고 쿼리를 실행한다. team_id 는 ctx 에서만 주입되며 도구 입력으로 받지 않는다.
 * 알려진 입력·미존재 오류(ToolInputError)만 메시지를 노출하고, 그 외는 일반 메시지로 마스킹한다.
 */
async function runReadTool<T>(
  extra: { authInfo?: { extra?: unknown } },
  fn: (ctx: OperatorContext, supabase: ReturnType<typeof createAdminClient>) => Promise<T>,
) {
  const ctx = (extra.authInfo?.extra as OperatorContext | undefined) ?? null;
  if (!ctx) {
    // withMcpAuth(required)가 미인증을 401로 이미 차단하므로 도달하지 않는 방어선.
    return errorResult("인증 정보를 확인할 수 없습니다.");
  }
  try {
    const supabase = createAdminClient();
    const data = await fn(ctx, supabase);
    return textResult(data);
  } catch (err) {
    if (err instanceof ToolInputError) return errorResult(err.message);
    return errorResult("요청을 처리하지 못했습니다.");
  }
}

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

    // ── 읽기 도구 6개(SG-04). 모두 인증된 팀 멤버 허용, ctx.team_id 로 자동 스코프. ──

    server.registerTool(
      "list_today_gatherings",
      {
        title: "오늘의 모임",
        description:
          "오늘(또는 지정한 날짜, KST 기준) 우리 팀 모임 목록과 각 모임의 참석자 수를 반환합니다. 날짜는 YYYY-MM-DD.",
        inputSchema: {
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.")
            .optional(),
        },
      },
      async (args, extra) =>
        runReadTool(extra, (ctx, supabase) =>
          listTodayGatherings(supabase, ctx.team_id, args.date),
        ),
    );

    server.registerTool(
      "list_recent_members",
      {
        title: "최근 가입 멤버",
        description:
          "우리 팀에 최근 가입한 멤버 목록을 가입일 최신순으로 반환합니다. limit 기본 10.",
        inputSchema: {
          limit: z.number().int().min(1).max(100).optional(),
        },
      },
      async (args, extra) =>
        runReadTool(extra, (ctx, supabase) =>
          listRecentMembers(supabase, ctx.team_id, args.limit ?? 10),
        ),
    );

    server.registerTool(
      "list_members_attendance",
      {
        title: "멤버 참석 현황",
        description:
          "우리 팀 활성 멤버별 과거 모임 참석 횟수와 마지막 참석시각을 '오래/전혀 안 나온 순'으로 반환합니다. 호출 대상 판단은 사용자가 합니다.",
        inputSchema: {
          limit: z.number().int().min(1).max(500).optional(),
        },
      },
      async (args, extra) =>
        runReadTool(extra, (ctx, supabase) =>
          listMembersAttendance(supabase, ctx.team_id, args.limit),
        ),
    );

    server.registerTool(
      "get_member_profile",
      {
        title: "멤버 프로필",
        description:
          "우리 팀 멤버 프로필(이름·생일·성별·가입일·역할·상태·소개·아바타)을 조회합니다. member_id(uuid) 또는 name 중 하나로 조회. 연락처·계좌 정보는 반환하지 않습니다.",
        inputSchema: {
          member_id: z.string().uuid("member_id 는 uuid 여야 합니다.").optional(),
          name: z.string().min(1).optional(),
        },
      },
      async (args, extra) =>
        runReadTool(extra, (ctx, supabase) =>
          getMemberProfile(supabase, ctx.team_id, {
            memberId: args.member_id,
            name: args.name,
          }),
        ),
    );

    server.registerTool(
      "list_gathering_non_attendees",
      {
        title: "모임 미참석자",
        description:
          "특정 모임에 참석하지 않은 우리 팀 활성 멤버 목록과 각자의 참석 현황을 반환합니다. gathering_id(uuid) 필요.",
        inputSchema: {
          gathering_id: z.string().uuid("gathering_id 는 uuid 여야 합니다."),
        },
      },
      async (args, extra) =>
        runReadTool(extra, (ctx, supabase) =>
          listGatheringNonAttendees(supabase, ctx.team_id, args.gathering_id),
        ),
    );

    server.registerTool(
      "list_push_status",
      {
        title: "푸시 구독 현황",
        description:
          "우리 팀 활성 멤버별 웹푸시 구독 여부를 반환합니다. 미구독 멤버가 먼저 정렬됩니다.",
        inputSchema: {},
      },
      async (_args, extra) =>
        runReadTool(extra, (ctx, supabase) => listPushStatus(supabase, ctx.team_id)),
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
