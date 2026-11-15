import { NextResponse } from "next/server";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export async function GET() {
  const { member } = await getCurrentMember();
  if (!member) return NextResponse.json({ prefs: [] });

  // 접속한 팀의 수신 설정만
  const { teamId } = await getRequestTeamContext();
  const admin = createUntypedAdminClient();
  const { data } = await admin
    .from("noti_pref_cfg")
    .select("noti_type_enm, enabled_yn")
    .eq("mem_id", member.id)
    .eq("team_id", teamId);

  return NextResponse.json({ prefs: data ?? [] });
}
