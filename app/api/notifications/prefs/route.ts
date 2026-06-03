import { NextResponse } from "next/server";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";

export async function GET() {
  const { member } = await getCurrentMember();
  if (!member) return NextResponse.json({ prefs: [] });

  const admin = createUntypedAdminClient();
  const { data } = await admin
    .from("noti_pref_cfg")
    .select("noti_type_enm, enabled_yn")
    .eq("mem_id", member.id);

  return NextResponse.json({ prefs: data ?? [] });
}
