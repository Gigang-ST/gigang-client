import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashToken, TOKEN_PREFIX } from "@/lib/mcp/auth";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — PAT 발급·목록·폐기 로직(SG-03, 스펙 §3.1, AC-07/08/09).
 *
 * 설계 원칙
 * - **service-role 클라이언트 주입식 순수함수**: `lib/mcp/auth.ts`·`lib/mcp/send-push.ts`·
 *   `lib/mcp/queries.ts`와 동일하게 클라이언트를 인자로 받아 이 모듈은 `server-only` 체인
 *   (`admin.ts`)을 import 하지 않는다 → vitest server-only 함정 회피
 *   ([[troubleshooting/vitest-server-only-trap]]). 호출부(`app/actions/mcp-token.ts`)가
 *   admin 클라이언트를 생성해 주입한다.
 * - **해시 재사용(AC-07 핵심)**: 발급 시 `lib/mcp/auth.ts`의 `hashToken`을 그대로 재사용해
 *   `mcp_token_rel.token_hash`에 저장한다. 여기서 새 해시 로직을 만들면 `resolveOperator`의
 *   검증과 어긋나 발급 직후 로그인 실패로 이어진다 — 반드시 동일 함수를 공유.
 * - **원문 1회 노출**: `issueMcpToken`의 반환값에만 평문 토큰이 담기며, DB에는 해시만 저장한다.
 *   호출부는 이 반환값을 응답으로 1회 전달한 뒤 어디에도 저장하지 않는다.
 * - **본인 스코프 강제**: `listMcpTokens`·`revokeMcpToken`은 항상 `mem_id` eq 필터로 스코프한다
 *   (`mcp_token_rel`은 service-role 전용 RLS라 애플리케이션 레벨에서 강제해야 함). `token_hash`는
 *   어떤 select 목록에도 포함하지 않는다.
 */

type Db = SupabaseClient<Database>;

/** 목록 화면에 내려줄 요약 — token_hash·원문은 절대 포함하지 않는다. */
export type McpTokenSummary = {
  token_id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
};

export type IssueMcpTokenResult = {
  token_id: string;
  /** 평문 토큰 — 이 반환값에서만 1회 노출. 저장하지 않는다. */
  token: string;
  label: string | null;
  created_at: string;
};

/** 폐기 대상을 찾지 못했을 때(존재하지 않음·이미 폐기·본인 소유 아님) — 사유를 구분해 노출하지 않는다. */
export class McpTokenNotFoundError extends Error {
  constructor(message = "토큰을 찾을 수 없습니다.") {
    super(message);
    this.name = "McpTokenNotFoundError";
  }
}

/** 발급 토큰 원문 생성: `gmcp_` + 32바이트 랜덤(base64url). */
function generateRawToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/**
 * PAT를 발급해 `mcp_token_rel`에 해시만 저장한다(스펙 §3.1).
 *
 * @param supabase service-role 클라이언트(라우트/서버 액션에서 주입)
 * @param params   mem_id·team_id(발급 시점 팀)·label(선택)
 * @returns 평문 토큰이 담긴 결과 — 이 호출 응답에서만 1회 노출된다.
 */
export async function issueMcpToken(
  supabase: Db,
  params: { memId: string; teamId: string; label: string | null },
): Promise<IssueMcpTokenResult> {
  const token = generateRawToken();
  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from("mcp_token_rel")
    .insert({
      mem_id: params.memId,
      team_id: params.teamId,
      token_hash: tokenHash,
      label: params.label,
    })
    .select("token_id, created_at, label")
    .single();

  if (error || !data) {
    throw error ?? new Error("토큰 발급에 실패했습니다.");
  }

  return {
    token_id: data.token_id,
    token,
    label: data.label,
    created_at: data.created_at,
  };
}

/**
 * 로그인 멤버 본인의 토큰 목록을 반환한다(최신순). `token_hash`는 절대 select 하지 않는다.
 */
export async function listMcpTokens(
  supabase: Db,
  memId: string,
): Promise<McpTokenSummary[]> {
  const { data, error } = await supabase
    .from("mcp_token_rel")
    .select("token_id, label, created_at, last_used_at, revoked_at")
    .eq("mem_id", memId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    token_id: row.token_id,
    label: row.label,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked: row.revoked_at !== null,
  }));
}

/**
 * 본인 소유 토큰을 폐기한다(`revoked_at = now()`). `mem_id` eq 필터로 남의 토큰 폐기를 원천 차단하고,
 * 이미 폐기된 토큰을 다시 조작하지 않도록 `revoked_at is null` 조건도 함께 건다.
 * 매칭되는 행이 없으면(미존재·이미 폐기·본인 소유 아님을 구분하지 않고) `McpTokenNotFoundError`.
 */
export async function revokeMcpToken(
  supabase: Db,
  memId: string,
  tokenId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("mcp_token_rel")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_id", tokenId)
    .eq("mem_id", memId)
    .is("revoked_at", null)
    .select("token_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new McpTokenNotFoundError();
}
