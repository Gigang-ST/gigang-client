"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function markNotificationRead(notiId: string) {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    // ⚠️ 에러를 삼키지 않는다 — 사유는 `markAllNotificationsRead`·`deleteNotification` 주석 참조.
    const { error } = await admin
      .from("noti_mst")
      .update({ read_yn: true })
      .eq("noti_id", notiId)
      .eq("mem_id", member.id);
    if (error) throw error;
  });
}
