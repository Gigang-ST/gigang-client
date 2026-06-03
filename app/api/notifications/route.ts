import { NextRequest, NextResponse } from "next/server";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";

export async function GET(request: NextRequest) {
  const { member } = await getCurrentMember();
  if (!member) return NextResponse.json({ notifications: [] });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const cursor = searchParams.get("cursor");

  const admin = createUntypedAdminClient();
  let query = admin
    .from("noti_mst")
    .select(
      "noti_id, team_id, mem_id, noti_type_enm, noti_nm, noti_cont, ref_id, ref_type_enm, read_yn, crt_at",
    )
    .eq("mem_id", member.id)
    .eq("del_yn", false)
    .order("crt_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("crt_at", cursor);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });

  return NextResponse.json({ notifications: data ?? [] });
}
