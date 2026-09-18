"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function deleteAllNotifications() {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    // ⚠️ 에러를 삼키지 않는다 — 이유는 `mark-all-notifications-read.ts`와 같다.
    const { error } = await admin
      .from("noti_mst")
      .update({ del_yn: true })
      .eq("mem_id", member.id)
      .eq("del_yn", false);
    if (error) throw error;
  });
}
