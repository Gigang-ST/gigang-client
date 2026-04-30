"use server";

import { revalidateTag } from "next/cache";

import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

type SaveUtmbProfileInput = {
  profileUrl: string;
  utmbIndex: number;
  recentRaceName: string | null;
  recentRaceRecord: string | null;
};

export async function saveUtmbProfile(input: SaveUtmbProfileInput) {
  const { member, supabase } = await getCurrentMember();
  if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

  const { teamId } = await getRequestTeamContext();

  const { error } = await supabase.from("mem_utmb_prf").upsert(
    {
      mem_id: member.id,
      utmb_prf_url: input.profileUrl,
      utmb_idx: input.utmbIndex,
      rct_race_nm: input.recentRaceName,
      rct_race_rec: input.recentRaceRecord,
      vers: 0,
      del_yn: false,
    },
    { onConflict: "mem_id,vers" },
  );

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidateTag(`records:${teamId}`, "max");
  return { ok: true as const, message: null };
}

export async function deleteUtmbProfile() {
  const { member, supabase } = await getCurrentMember();
  if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

  const { teamId } = await getRequestTeamContext();

  const { error } = await supabase
    .from("mem_utmb_prf")
    .delete()
    .eq("mem_id", member.id)
    .eq("vers", 0);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidateTag(`records:${teamId}`, "max");
  return { ok: true as const, message: null };
}
