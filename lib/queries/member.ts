import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";

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
