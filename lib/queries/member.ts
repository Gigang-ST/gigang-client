import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";

/**
 * 현재 로그인한 사용자의 user + member 정보를 가져온다.
 * 서버 컴포넌트 / 서버 액션에서만 사용.
 */
export async function getCurrentMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, member: null };

  validateUUID(user.id);
  const { data: member } = await supabase
    .from("member")
    .select(
      "id, full_name, gender, birthday, phone, email, avatar_url, bank_name, bank_account, admin, status",
    )
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  return { user, member };
}
