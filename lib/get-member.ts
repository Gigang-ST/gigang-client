import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";
import {
  fetchMemMstWithTeamRel,
  mapMstRelToAppMemberProfile,
} from "@/lib/queries/app-member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

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

export type GetMemberResult = {
  userId: string | null;
  member: Member | null;
};

/**
 * 현재 요청의 인증 유저에 해당하는 회원 프로필(mem_mst + 요청 Host 기준 팀 소속)을 가져온다.
 */
export const getMember = cache(async (): Promise<GetMemberResult> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { userId: null, member: null };

  validateUUID(user.id);

  const { teamId } = await getRequestTeamContext();
  const bundle = await fetchMemMstWithTeamRel(supabase, user.id, teamId);
  if (!bundle) return { userId: user.id, member: null };

  const p = mapMstRelToAppMemberProfile(bundle.mst, bundle.rel);

  return {
    userId: user.id,
    member: {
      id: p.id,
      full_name: p.full_name ?? "",
      gender: (bundle.mst.gdr_enm ?? "") as "" | "male" | "female",
      birthday: p.birthday ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      avatar_url: p.avatar_url ?? "",
      bank_name: p.bank_name ?? "",
      bank_account: p.bank_account ?? "",
      joined_at: p.joined_at ?? "",
      status: p.status ?? "",
      admin: p.admin ?? false,
    },
  };
});
