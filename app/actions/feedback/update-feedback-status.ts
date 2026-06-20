"use server";

import { revalidatePath } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { adminUpdateStatusSchema, type FeedbackStatus } from "@/lib/validations/feedback";

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  return withAdmin(async () => {
    const parsed = adminUpdateStatusSchema.safeParse({ status });
    if (!parsed.success) return { ok: false, message: "잘못된 상태값입니다." };

    const db = createUntypedAdminClient();
    const { error } = await db.from("fdbk_mst").update({ stts_enm: parsed.data.status }).eq("fdbk_id", id).eq("del_yn", false);

    if (error) return { ok: false, message: "상태 변경에 실패했습니다." };

    revalidatePath("/admin/feedback");
    return { ok: true, message: null };
  });
}
