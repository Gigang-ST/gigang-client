import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * 운영 MCP 토큰 검증 결과로 만들어지는 operator 컨텍스트.
 * 팀 스코프 신원 — 이후 모든 도구 쿼리는 반드시 `team_id`로 필터한다.
 * 연락처·계좌 등 민감정보는 절대 포함하지 않는다(스펙 §3.3 / M-03 불변식).
 */
export type OperatorContext = {
  mem_id: string;
  team_id: string;
  is_admin: boolean;
  /** 표시용 멤버 이름(health/whoami). 민감정보 아님. */
  mem_nm: string;
};

/** 발급 토큰 접두사. `gmcp_` + base64url(random 32 bytes). */
export const TOKEN_PREFIX = "gmcp_";

/**
 * 원문 토큰을 sha256 hex로 해시한다. `mcp_token_rel.token_hash`와 동일 규약.
 * 원문은 어디에도 저장하지 않으며, 검증은 해시 비교로만 한다.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Bearer 원문 토큰을 operator 컨텍스트로 해석한다(스펙 §3.2 검증 흐름).
 *
 * 실패 시(토큰 없음·형식오류·미존재·폐기·만료·비-active 멤버) `null`을 반환하며,
 * 라우트 인증 래퍼는 이를 401로 매핑한다. 어떤 실패 사유도 응답으로 흘리지 않는다.
 *
 * 순수 검증 로직만 담아 테스트 용이성을 확보한다 — service-role 클라이언트는
 * 호출부(라우트)에서 주입하며, 이 모듈은 `server-only` 체인을 import 하지 않는다.
 *
 * @param token   `Authorization: Bearer` 원문 토큰
 * @param supabase service-role Supabase 클라이언트(RLS 우회 — 이 테이블은 service 전용)
 */
export async function resolveOperator(
  token: string | undefined | null,
  supabase: SupabaseClient<Database>,
): Promise<OperatorContext | null> {
  if (typeof token !== "string") return null;
  const raw = token.trim();
  if (!raw.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(raw);

  // 1) 토큰 행 조회: 해시 일치 & 미폐기. 만료는 아래에서 별도 검증.
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("mcp_token_rel")
    .select("token_id, mem_id, team_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (tokenErr || !tokenRow) return null;

  // 만료 검증(expires_at null = 무기한). now 이하이면 무효.
  if (
    tokenRow.expires_at !== null &&
    new Date(tokenRow.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  // 2) 팀 멤버십 조회: 앱 전역 규약과 동일하게 vers=0·del_yn=false 를 현재 정본 행으로 본다
  //    (lib/queries/app-member.ts 의 fetchMemMstWithTeamRel 과 동일).
  const { data: rel, error: relErr } = await supabase
    .from("team_mem_rel")
    .select("mem_st_cd, team_role_cd")
    .eq("mem_id", tokenRow.mem_id)
    .eq("team_id", tokenRow.team_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (relErr || !rel) return null;
  // 비활성(inactive/left) 멤버 토큰은 무효(스펙 §3.2, G-5).
  if (rel.mem_st_cd !== "active") return null;

  const isAdmin =
    rel.team_role_cd === "owner" || rel.team_role_cd === "admin";

  // 3) 표시용 이름(민감정보 아님). 조회 실패해도 인증은 성립.
  const { data: mem } = await supabase
    .from("mem_mst")
    .select("mem_nm")
    .eq("mem_id", tokenRow.mem_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  // last_used_at 갱신은 best-effort — 실패해도 검증에 영향 없음(예외 삼킴).
  void Promise.resolve(
    supabase
      .from("mcp_token_rel")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_id", tokenRow.token_id),
  ).catch(() => {});

  return {
    mem_id: tokenRow.mem_id,
    team_id: tokenRow.team_id,
    is_admin: isAdmin,
    mem_nm: mem?.mem_nm ?? "",
  };
}
