"use server";

import { withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requestDuesCheck() {
  return withMember(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: owners } = await db.from("team_mem_rel").select("mem_id").eq("team_id", teamId).eq("team_role_cd", "owner").eq("vers", 0).eq("del_yn", false);
    if (!owners?.length) return { ok: false as const, message: "owner를 찾을 수 없습니다." };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: existing } = await db.from("noti_mst").select("noti_id").eq("mem_id", owners[0].mem_id).eq("noti_type_enm", "dues_check_req").gte("crt_at", todayStart.toISOString()).limit(1).maybeSingle();
    if (existing) return { ok: false as const, message: "오늘 이미 요청하셨습니다." };

    const rows = owners.map((o) => ({
      team_id: teamId, mem_id: o.mem_id, noti_type_enm: "dues_check_req",
      noti_nm: "회비 문의", noti_cont: `${member.full_name}님이 회비내역 확인을 요청하셨습니다.`,
      ref_id: member.id, ref_type_enm: "member", del_yn: false, read_yn: false,
    }));

    const { error } = await db.from("noti_mst").insert(rows);
    if (error) return { ok: false as const, message: "요청 전송에 실패했습니다." };
    return { ok: true as const, message: null };
  });
}
