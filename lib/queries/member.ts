import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";

/**
 * 현재 로그인한 유저의 member 레코드를 조회한다.
 * OAuth ID(카카오/구글)로 member를 매칭하며, 전체 컬럼(`*`)을 조회한다.
 *
 * @returns `{ user, member, supabase }` — `user`·`member`는 미인증이거나 member가 없으면 `null`.
 *   `supabase` 클라이언트는 항상 반환되어 후속 쿼리에 재사용 가능.
 *
 * @example
 * const { user, member, supabase } = await getCurrentMember();
 * if (!member) redirect("/auth/login");
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
 * 미인증·member 미존재·admin이 아닌 경우 모두 `null`을 반환한다.
 *
 * @returns `{ id, admin }` 형태의 member 레코드, 또는 `null`
 *
 * @example
 * const admin = await verifyAdmin();
 * if (!admin) return { ok: false, message: "권한이 없습니다" };
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
