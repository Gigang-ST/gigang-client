"use server";

import { revalidatePath } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function setPrimaryTitle(ttlId: string | null) {
  return withActive(async ({ member }) => {
    const db = createAdminClient();

    await db.from("mem_ttl_rel")
      .update({ is_prmy_yn: false })
      .eq("team_mem_id", member.team_mem_id)
      .eq("is_prmy_yn", true)
      .eq("vers", 0)
      .eq("del_yn", false);

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
  });
}

export async function setSelectedEffect(badgeEffect: string | null, frameCd: string | null) {
  return withActive(async ({ member }) => {
    const db = createAdminClient();
    const { error } = await db.from("team_mem_rel")
      .update({ selected_badge_effect: badgeEffect, selected_frame_cd: frameCd })
      .eq("team_mem_id", member.team_mem_id)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (error) return { ok: false, message: "저장에 실패했습니다" };
    revalidatePath("/profile");
    return { ok: true, message: null };
  });
}
