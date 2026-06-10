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
export const getCurrentMember = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, member: null, supabase };

  validateUUID(user.id);

  const { teamId } = await getRequestTeamContext();
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
 */
export async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { teamId } = await getRequestTeamContext();
  const bundle = await fetchMemMstWithTeamRel(supabase, user.id, teamId);
  if (!bundle) return null;
  if (
    bundle.rel.team_role_cd !== "admin" &&
    bundle.rel.team_role_cd !== "owner"
  ) {
    return null;
  }
  return { id: bundle.mst.mem_id, admin: true };
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
