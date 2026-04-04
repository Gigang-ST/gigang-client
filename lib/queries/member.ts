import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";
import {
  fetchMemMstWithGigangRel,
  mapMstRelToAppMemberProfile,
  type AppMemberProfile,
} from "@/lib/queries/app-member";

export type { AppMemberProfile };

/**
 * 현재 로그인한 유저의 회원 프로필(mem_mst + 기강 team_mem_rel)을 조회한다.
 * 레거시 OAuth 연동(oauth_* = auth.uid()) 또는 mem_id = auth.uid() 로 매칭한다.
 *
 * @returns `{ user, member, supabase }`
 *   - `member` — `AppMemberProfile`. 미인증·매칭 실패 시 `null`
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

  const bundle = await fetchMemMstWithGigangRel(supabase, user.id);
  const member = bundle
    ? mapMstRelToAppMemberProfile(bundle.mst, bundle.rel)
    : null;

  return { user, member, supabase };
});

/**
 * 현재 로그인한 유저가 기강 팀의 owner 또는 admin 인지 확인한다.
 */
export async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const bundle = await fetchMemMstWithGigangRel(supabase, user.id);
  if (!bundle?.rel) return null;
  if (
    bundle.rel.team_role_cd !== "admin" &&
    bundle.rel.team_role_cd !== "owner"
  ) {
    return null;
  }
  return { id: bundle.mst.mem_id, admin: true };
}
