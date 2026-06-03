"use server";

import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";

export async function markNotificationRead(notiId: string) {
  const { member } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  const admin = createUntypedAdminClient();
  await admin
    .from("noti_mst")
    .update({ read_yn: true })
    .eq("noti_id", notiId)
    .eq("mem_id", member.id);
}
