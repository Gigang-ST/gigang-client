"use server";

import { revalidatePath } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { introTxtSchema } from "@/lib/validations/member";

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

/**
 * 한마디(자기소개) 저장.
 *
 * 꾸미기 자산과 같은 팀 스코프 필드라 `setSelectedEffect`와 동일하게 `team_mem_rel`을 직접 update한다
 * (`apply_team_mem_rel_change`는 상태·역할 변경 이력화 전용 — 한마디는 이력 사유가 아니다).
 * 빈 문자열은 "설정 안 함"이므로 null로 저장해 카드에서 줄 자체가 사라지게 한다.
 */
export async function setIntroTxt(introTxt: string) {
  const parsed = introTxtSchema.safeParse(introTxt);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "한마디를 확인해 주세요" };
  }

  return withActive(async ({ member }) => {
    const db = createAdminClient();
    const { error } = await db.from("team_mem_rel")
      .update({ intro_txt: parsed.data || null })
      .eq("team_mem_id", member.team_mem_id)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (error) return { ok: false, message: "저장에 실패했습니다" };
    revalidatePath("/profile");
    return { ok: true, message: null };
  });
}
