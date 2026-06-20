"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function markAllNotificationsRead() {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    await admin.from("noti_mst").update({ read_yn: true }).eq("mem_id", member.id).eq("del_yn", false).eq("read_yn", false);
  });
}
