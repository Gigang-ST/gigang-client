"use server";

import { withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function deleteAllNotifications() {
  return withMember(async ({ member }) => {
    // 접속한 팀 알림만 — 울산에서 일괄 처리해도 기강 알림은 그대로 둔다
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();
    // ⚠️ 에러를 삼키지 않는다 — 이유는 `mark-all-notifications-read.ts`와 같다.
    const { error } = await admin
      .from("noti_mst")
      .update({ del_yn: true })
      .eq("mem_id", member.id)
      .eq("team_id", teamId)
      .eq("del_yn", false);
    if (error) throw error;
  });
}
