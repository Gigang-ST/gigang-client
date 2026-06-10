"use server";

import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";

export async function upsertNotiPref(notiTypeEnm: string, enabledYn: boolean) {
  const { member } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  const admin = createUntypedAdminClient();
  await admin.from("noti_pref_cfg").upsert(
    {
      mem_id: member.id,
      noti_type_enm: notiTypeEnm,
      enabled_yn: enabledYn,
    },
    { onConflict: "mem_id,noti_type_enm" },
  );
}
