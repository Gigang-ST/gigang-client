import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";

/**
 * 현재 사용자가 관리자인지 확인하고, 아니면 리다이렉트한다.
 * 관리자 전용 페이지의 서버 컴포넌트에서 사용.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  validateUUID(user.id);
  const { data: member } = await supabase
    .from("member")
    .select("id, admin")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  if (!member?.admin) redirect("/settings");

  return { user, member };
}
