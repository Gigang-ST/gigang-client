"use server";

import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";

export async function deleteAllNotifications() {
  const { member } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  const admin = createUntypedAdminClient();
  await admin
    .from("noti_mst")
    .update({ del_yn: true })
    .eq("mem_id", member.id)
    .eq("del_yn", false);
}
