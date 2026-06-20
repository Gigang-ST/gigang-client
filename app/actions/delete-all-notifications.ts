"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function deleteAllNotifications() {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    await admin.from("noti_mst").update({ del_yn: true }).eq("mem_id", member.id).eq("del_yn", false);
  });
}
