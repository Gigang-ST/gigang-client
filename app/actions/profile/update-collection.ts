"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";
import { revalidatePath } from "next/cache";

export async function setPrimaryTitle(ttlId: string | null) {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const db = createAdminClient();

  // 기존 대표 칭호 해제
  await db.from("mem_ttl_rel")
    .update({ is_prmy_yn: false })
    .eq("team_mem_id", member.team_mem_id)
    .eq("is_prmy_yn", true)
    .eq("vers", 0)
    .eq("del_yn", false);

  // 새 대표 칭호 설정
  if (ttlId) {
    const { error } = await db.from("mem_ttl_rel")
      .update({ is_prmy_yn: true })
      .eq("team_mem_id", member.team_mem_id)
      .eq("ttl_id", ttlId)
      .eq("vers", 0)
      .eq("del_yn", false);
    if (error) return { ok: false, message: "칭호 설정에 실패했습니다" };
  }

  revalidatePath("/profile");
  return { ok: true, message: null };
}

export async function setSelectedEffect(badgeEffect: string | null, frameCd: string | null) {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다" };

  const db = createAdminClient();
  const { error } = await db.from("team_mem_rel")
    .update({
      selected_badge_effect: badgeEffect,
      selected_frame_cd: frameCd,
    })
    .eq("team_mem_id", member.team_mem_id)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (error) return { ok: false, message: "저장에 실패했습니다" };
  revalidatePath("/profile");
  return { ok: true, message: null };
}
