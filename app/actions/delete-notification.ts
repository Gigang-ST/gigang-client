"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function deleteNotification(notiId: string) {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    await admin.from("noti_mst").update({ del_yn: true }).eq("noti_id", notiId).eq("mem_id", member.id);
  });
}
