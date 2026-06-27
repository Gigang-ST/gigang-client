"use server";

import { withMember } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requestDuesCheck() {
  return withMember(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: owners } = await db.from("team_mem_rel").select("mem_id").eq("team_id", teamId).eq("team_role_cd", "owner").eq("vers", 0).eq("del_yn", false);
    if (!owners?.length) return { ok: false as const, message: "owner를 찾을 수 없습니다." };

    const todayStart = dayjs().startOf("day").toISOString();

    const { data: existing } = await db.from("noti_mst").select("noti_id").eq("mem_id", owners[0].mem_id).eq("noti_type_enm", "dues_check_req").gte("crt_at", todayStart).limit(1).maybeSingle();
    if (existing) return { ok: false as const, message: "오늘 이미 요청하셨습니다." };

    // 인앱+푸시 한 몸 (관문). 회비 확인 요청은 owner 전원에게.
    try {
      await insertNotiMany({
        teamId,
        memIds: owners.map((o) => o.mem_id),
        notiTypeEnm: "dues_check_req",
        notiNm: "회비 문의",
        notiCont: `${member.full_name}님이 회비내역 확인을 요청하셨습니다.`,
        refId: member.id,
        refTypeEnm: "member",
      });
    } catch {
      return { ok: false as const, message: "요청 전송에 실패했습니다." };
    }
    return { ok: true as const, message: null };
  });
}
