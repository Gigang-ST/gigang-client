"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function upsertNotiPref(notiTypeEnm: string, enabledYn: boolean) {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    await admin.from("noti_pref_cfg").upsert(
      { mem_id: member.id, noti_type_enm: notiTypeEnm, enabled_yn: enabledYn },
      { onConflict: "mem_id,noti_type_enm" },
    );
  });
}
