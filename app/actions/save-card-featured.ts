"use server";

import { revalidatePath } from "next/cache";

import type { CardFeaturedKey } from "@/lib/member-card";
import { getCurrentMember, verifyActive } from "@/lib/queries/member";
import { createAdminClient } from "@/lib/supabase/admin";

/** 본인 카드에 노출할 (종목×거리) 선택을 저장한다. null/빈배열이면 전체 표시(기본값). */
export async function saveCardFeatured(
  featured: CardFeaturedKey[] | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다." };

  const activeCheck = await verifyActive();
  if (!activeCheck.ok) return { ok: false, message: activeCheck.message };

  // 입력 정규화: sport/evt 문자열만 허용, 비어있으면 null(전체 표시)
  const clean =
    featured && featured.length > 0
      ? featured
          .filter((f) => typeof f?.sport === "string" && typeof f?.evt === "string")
          .map((f) => ({ sport: f.sport, evt: f.evt }))
      : null;

  const db = createAdminClient();
  const { error } = await db
    .from("team_mem_rel")
    .update({ card_featured: clean })
    .eq("team_mem_id", member.team_mem_id)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (error) return { ok: false, message: "저장에 실패했습니다." };
  revalidatePath("/profile");
  return { ok: true };
}
