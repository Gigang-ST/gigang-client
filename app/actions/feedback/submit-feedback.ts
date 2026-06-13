"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/queries/member";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { submitFeedbackSchema } from "@/lib/validations/feedback";

export async function submitFeedback(body: string) {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다." };

  const parsed = submitFeedbackSchema.safeParse({ body });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다." };
  }

  const db = createUntypedAdminClient();
  const { error } = await db.from("feedback_messages").insert({
    user_id: member.id,
    body: parsed.data.body,
  });

  if (error) return { ok: false, message: "제출에 실패했습니다. 다시 시도해주세요." };

  revalidatePath("/profile/feedback");
  return { ok: true, message: null };
}
