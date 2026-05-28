"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";

export async function updateEffectLevel(effectCd: string, rarityLevel: number) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  if (rarityLevel < 1 || rarityLevel > 10) {
    return { ok: false, message: "등급은 1~10 사이여야 합니다" };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("effect_mst")
    .update({ rarity_level: rarityLevel })
    .eq("effect_cd", effectCd);

  if (error) return { ok: false, message: "저장에 실패했습니다" };
  return { ok: true, message: null };
}
