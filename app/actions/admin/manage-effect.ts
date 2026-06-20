"use server";

import { withAdmin } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateEffectLevel(effectCd: string, rarityLevel: number) {
  return withAdmin(async () => {
    if (rarityLevel < 1 || rarityLevel > 10) return { ok: false, message: "등급은 1~10 사이여야 합니다" };
    const db = createAdminClient();
    const { error } = await db.from("effect_mst").update({ rarity_level: rarityLevel }).eq("effect_cd", effectCd);
    if (error) return { ok: false, message: "저장에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export type UnlockCond =
  | { type: "rarity"; level: number }
  | { type: "title"; ttl_nm: string }
  | { type: "point"; amount: number }
  | null;

export async function updateEffectUnlockCond(effectCd: string, cond: UnlockCond) {
  return withAdmin(async () => {
    if (cond?.type === "rarity" && (cond.level < 1 || cond.level > 10)) {
      return { ok: false, message: "등급은 1~10 사이여야 합니다" };
    }
    const db = createAdminClient();
    const { error } = await db.from("effect_mst").update({ unlock_cond_json: cond }).eq("effect_cd", effectCd);
    if (error) return { ok: false, message: "저장에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function toggleEffectUseYn(effectCd: string, useYn: boolean) {
  return withAdmin(async () => {
    const db = createAdminClient();
    const { error } = await db.from("effect_mst").update({ use_yn: useYn }).eq("effect_cd", effectCd);
    if (error) return { ok: false, message: "저장에 실패했습니다" };
    return { ok: true, message: null };
  });
}
