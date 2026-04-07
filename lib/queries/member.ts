import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";
import {
  fetchMemMstWithTeamRel,
  mapMstRelToAppMemberProfile,
  type AppMemberProfile,
} from "@/lib/queries/app-member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

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
