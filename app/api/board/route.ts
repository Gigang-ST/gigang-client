import { NextRequest, NextResponse } from "next/server";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as "notice" | "update" | null;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);

  if (!type || !["notice", "update"].includes(type)) {
    return NextResponse.json({ error: "type 파라미터가 필요합니다." }, { status: 400 });
  }

  const { teamId } = await getRequestTeamContext();
  const admin = createUntypedAdminClient();

  const { data, error } = await admin
    .from("brd_post_mst")
    .select("post_id, post_nm, pin_yn, crt_at, mem_mst(mem_nm)")
    .eq("team_id", teamId)
    .eq("post_type_enm", type)
    .eq("del_yn", false)
    .order("pin_yn", { ascending: false })
    .order("crt_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }

  const posts = (data ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    return {
      post_id: row.post_id,
      post_nm: row.post_nm,
      pin_yn: row.pin_yn,
      crt_at: row.crt_at,
      writ_mem_nm: (mem as { mem_nm: string } | null)?.mem_nm ?? null,
    };
  });

  return NextResponse.json({ posts });
}
