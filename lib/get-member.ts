import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";

export type Member = {
  id: string;
  full_name: string;
  gender: "male" | "female" | "";
  birthday: string;
  phone: string;
  email: string;
  avatar_url: string;
  bank_name: string;
  bank_account: string;
  joined_at: string;
  status: string;
  admin: boolean;
};

/**
 * 현재 요청의 인증 유저에 해당하는 member를 가져온다.
 * React cache()로 같은 서버 렌더 내에서 여러 번 호출해도 DB 쿼리는 1회만 실행.
 */
export const getMember = cache(async (): Promise<Member | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  validateUUID(user.id);
  const { data } = await supabase
    .from("member")
    .select(
      "id, full_name, gender, birthday, phone, email, avatar_url, bank_name, bank_account, joined_at, status, admin",
    )
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    full_name: data.full_name ?? "",
    gender: (data.gender ?? "") as "male" | "female" | "",
    birthday: data.birthday ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    avatar_url: data.avatar_url ?? "",
    bank_name: data.bank_name ?? "",
    bank_account: data.bank_account ?? "",
    joined_at: data.joined_at ?? "",
    status: data.status ?? "",
    admin: data.admin ?? false,
  };
});
