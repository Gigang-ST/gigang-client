"use server";

import { withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function upsertNotiPref(notiTypeEnm: string, enabledYn: boolean) {
  return withMember(async ({ member }) => {
    // 수신 설정은 팀별 — 접속한 팀의 설정만 바꾼다
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();
    await admin.from("noti_pref_cfg").upsert(
      { team_id: teamId, mem_id: member.id, noti_type_enm: notiTypeEnm, enabled_yn: enabledYn },
      { onConflict: "team_id,mem_id,noti_type_enm" },
    );
  });
}
