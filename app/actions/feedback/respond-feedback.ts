"use server";

import { revalidatePath } from "next/cache";

import { verifyAdmin } from "@/lib/queries/member";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { adminRespondSchema } from "@/lib/validations/feedback";

export async function respondFeedback(id: string, adminNote: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "관리자 권한이 필요합니다." };

  const parsed = adminRespondSchema.safeParse({ adminNote });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." };

  const db = createUntypedAdminClient();
  const { error } = await db
    .from("fdbk_mst")
    .update({
      adm_note_txt: parsed.data.adminNote ?? null,
      rspd_at: new Date().toISOString(),
    })
    .eq("fdbk_id", id)
    .eq("del_yn", false);

  if (error) return { ok: false, message: "답변 저장에 실패했습니다." };

  revalidatePath("/admin/feedback");
  revalidatePath("/profile/feedback");
  return { ok: true, message: null };
}
