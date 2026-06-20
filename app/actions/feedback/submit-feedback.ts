"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { submitFeedbackSchema } from "@/lib/validations/feedback";

export async function submitFeedback(body: string) {
  return withMember(async ({ member }) => {
    const parsed = submitFeedbackSchema.safeParse({ body });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." };
    }

    const db = createUntypedAdminClient();
    const { error } = await db.from("fdbk_mst").insert({ mem_id: member.id, cont_txt: parsed.data.body });

    if (error) return { ok: false, message: "제출에 실패했습니다. 다시 시도해주세요." };

    revalidatePath("/profile/feedback");
    return { ok: true, message: null };
  });
}
