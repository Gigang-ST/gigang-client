import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";

/**
 * 현재 로그인한 유저의 member 레코드를 조회한다.
 * 인증되지 않았거나 member가 없으면 null을 반환한다.
 *
 * 전체 컬럼(*)을 조회하므로 호출 측에서 필요한 필드만 사용하면 된다.
 * supabase 클라이언트도 함께 반환하여 후속 쿼리에 재사용할 수 있다.
 */
export async function getCurrentMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, member: null, supabase };

  validateUUID(user.id);
  const { data: member } = await supabase
    .from("member")
    .select("*")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  return { user, member, supabase };
}

/**
 * 현재 로그인한 유저가 admin인지 확인한다.
 * admin이면 member 레코드({ id, admin })를, 아니면 null을 반환한다.
 *
 * 서버 액션에서 admin 권한이 필요한 작업 전에 호출한다.
 */
export async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("member")
    .select("id, admin")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  if (!member?.admin) return null;
  return member;
}
