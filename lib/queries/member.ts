import { cache } from "react";

import {
  fetchMemMstWithTeamRel,
  mapMstRelToAppMemberProfile,
  type AppMemberProfile,
} from "@/lib/queries/app-member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";

export type { AppMemberProfile };

/**
 * 현재 로그인한 유저의 회원 프로필(mem_mst + 요청 Host 기준 팀의 team_mem_rel)을 조회한다.
 * 레거시 OAuth 연동(oauth_* = auth.uid()) 또는 mem_id = auth.uid() 로 매칭한다.
 *
 * @returns `{ user, member, supabase }`
 *   - `member` — `AppMemberProfile`. 미인증·mem_mst 없음·해당 팀 `team_mem_rel` 없음 시 `null`
 *   - `member.id` === `mem_mst.mem_id`(레거시 `member.id` 와 1:1)
 *
 * @see {@link verifyAdmin} 팀 관리자(owner/admin) 확인
 */
/**
 * JWT 클레임 기반 경량 유저.
 * `auth.getUser()`(Auth 서버 왕복) 대신 `getClaims()`(로컬 서명 검증, 왕복 0회)를 쓴다 —
 * 미들웨어(proxy.ts)가 이미 같은 기준으로 세션을 검증하고, 권한 판정은 DB(team_mem_rel)로 하므로
 * 신뢰 수준 저하 없이 모든 dynamic 페이지 TTFB에서 Auth 왕복 1회를 제거한다.
 * 트레이드오프: 강제 로그아웃·계정 삭제가 액세스 토큰 만료까지 반영 지연 (미들웨어와 동일 기준).
 */
export type AuthClaimsUser = {
  id: string;
  email?: string;
  // supabase User와 동일하게 느슨한 타입 유지 (기존 소비처 호환)
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
};

export const getCurrentMember = cache(async () => {
  const supabase = await createClient();

  // getClaims()와 getRequestTeamContext()는 서로 의존하지 않으므로 병렬 실행
  const [{ data: claimsData }, { teamId }] = await Promise.all([
    supabase.auth.getClaims(),
    getRequestTeamContext(),
  ]);

  const claims = claimsData?.claims;
  if (!claims?.sub) return { user: null, member: null, supabase };

  const user: AuthClaimsUser = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
    app_metadata: (claims.app_metadata ?? {}) as Record<string, unknown>,
  };

  validateUUID(user.id);

  const bundle = await fetchMemMstWithTeamRel(supabase, user.id, teamId);
  const member = bundle
    ? mapMstRelToAppMemberProfile(bundle.mst, bundle.rel)
    : null;

  return { user, member, supabase };
});

/**
 * 현재 로그인한 유저가 보유한 칭호 ID Set을 반환한다.
 * 비로그인 또는 미가입이면 빈 Set 반환.
 */
export async function getMyTitleIds(): Promise<Set<string>> {
  const { member, supabase } = await getCurrentMember();
  if (!member) return new Set();
  const { data } = await supabase
    .from("mem_ttl_rel")
    .select("ttl_id")
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false);
  return new Set((data ?? []).map((r) => r.ttl_id));
}

/**
 * 현재 로그인한 유저가 보유한 칭호명 Set을 반환한다.
 * 비로그인 또는 미가입이면 빈 Set 반환.
 */
export async function getMyTitleNames(): Promise<Set<string>> {
  const { member, supabase } = await getCurrentMember();
  if (!member) return new Set();
  const { teamId } = await getRequestTeamContext();
  const { data } = await supabase
    .from("mem_ttl_rel")
    .select("ttl_mst!inner(ttl_nm), team_mem_rel!inner(mem_id)")
    .eq("team_mem_rel.mem_id", member.id)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  return new Set(
    (data ?? []).map((r) => {
      const t = Array.isArray(r.ttl_mst) ? r.ttl_mst[0] : r.ttl_mst;
      return (t as { ttl_nm: string }).ttl_nm;
    }).filter(Boolean)
  );
}

/**
 * 현재 로그인한 유저가 요청 Host 기준 팀의 owner 또는 admin 인지 확인한다.
 * getCurrentMember() cache를 재사용하므로 같은 요청/액션 내 중복 auth 호출이 발생하지 않는다.
 */
export async function verifyAdmin() {
  const { member } = await getCurrentMember();
  if (!member) return null;
  if (!member.admin) return null;
  return { id: member.id, admin: true };
}

/**
 * 현재 로그인한 유저가 active 상태인지 확인한다.
 * inactive면 { ok: false } 반환.
 */
export async function verifyActive(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다." };
  if (member.status !== "active") {
    return { ok: false, message: "비활성화된 회원입니다. 관리자에게 문의하세요." };
  }
  return { ok: true };
}
