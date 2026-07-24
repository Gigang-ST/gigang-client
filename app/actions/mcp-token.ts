"use server";

import {
  issueMcpToken,
  listMcpTokens as listMcpTokensQuery,
  revokeMcpToken as revokeMcpTokenMutation,
  McpTokenNotFoundError,
  type McpTokenSummary,
} from "@/lib/mcp/issue-token";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMcpTokenSchema } from "@/lib/validations/mcp-token";

/**
 * 운영 MCP PAT 발급/목록/폐기 서버 액션(SG-03, AC-08).
 *
 * `mcp_token_rel`은 service-role 전용 RLS라 여기서 admin 클라이언트를 생성해 주입하고,
 * 실제 쿼리·해시·스코프 로직은 `lib/mcp/issue-token.ts`(server-only 미의존, 단위테스트 가능)에 위임한다.
 * `verifyAdmin`은 요구하지 않는다 — 본인 토큰 발급/관리는 팀 멤버(가입 완료) 전원 허용(스펙 §3.1).
 */

export type { McpTokenSummary };

export type CreateMcpTokenResult =
  | {
      ok: true;
      token_id: string;
      /** 평문 토큰 — 이 응답에서만 1회 노출. 클라이언트는 저장하지 않고 사용자에게 즉시 보여준 뒤 버린다. */
      token: string;
      label: string | null;
      created_at: string;
    }
  | { ok: false; message: string };

/** 로그인 + 가입 완료 멤버 본인 명의로 새 PAT를 발급한다. */
export async function createMcpToken(labelInput: string): Promise<CreateMcpTokenResult> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다." };

  const parsed = createMcpTokenSchema.safeParse({ label: labelInput });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const { teamId } = await getRequestTeamContext();
  const admin = createAdminClient();

  try {
    const result = await issueMcpToken(admin, {
      memId: member.id,
      teamId,
      label: parsed.data.label ? parsed.data.label : null,
    });
    return {
      ok: true,
      token_id: result.token_id,
      token: result.token,
      label: result.label,
      created_at: result.created_at,
    };
  } catch (e) {
    console.error("[mcp-token] createMcpToken error:", e);
    return { ok: false, message: "토큰 발급에 실패했습니다. 다시 시도해 주세요." };
  }
}

export type ListMcpTokensResult =
  | { ok: true; tokens: McpTokenSummary[] }
  | { ok: false; message: string };

/** 로그인 멤버 본인의 토큰 목록만 반환한다(label·생성/사용/폐기 여부 — token_hash·원문 미포함). */
export async function listMcpTokens(): Promise<ListMcpTokensResult> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다." };

  const admin = createAdminClient();
  try {
    const tokens = await listMcpTokensQuery(admin, member.id);
    return { ok: true, tokens };
  } catch (e) {
    console.error("[mcp-token] listMcpTokens error:", e);
    return { ok: false, message: "토큰 목록을 불러오지 못했습니다." };
  }
}

export type RevokeMcpTokenResult = { ok: true } | { ok: false; message: string };

/** 본인 소유 토큰만 폐기 가능 — mem_id 스코프는 lib/mcp/issue-token.ts가 강제한다. */
export async function revokeMcpToken(tokenId: string): Promise<RevokeMcpTokenResult> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다." };
  if (!tokenId) return { ok: false, message: "잘못된 요청입니다." };

  const admin = createAdminClient();
  try {
    await revokeMcpTokenMutation(admin, member.id, tokenId);
    return { ok: true };
  } catch (e) {
    if (e instanceof McpTokenNotFoundError) {
      return { ok: false, message: e.message };
    }
    console.error("[mcp-token] revokeMcpToken error:", e);
    return { ok: false, message: "토큰 폐기에 실패했습니다." };
  }
}
