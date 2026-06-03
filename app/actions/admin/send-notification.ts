"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function sendNotification(input: {
  target: "all" | string[];
  notiNm: string;
  notiCont?: string | null;
}) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createUntypedAdminClient();

  if (input.target === "all") {
    await db.rpc("create_noti_for_team", {
      p_team_id: teamId,
      p_noti_type_enm: "adm_cust",
      p_noti_nm: input.notiNm,
      p_noti_cont: input.notiCont ?? null,
      p_ref_id: null,
      p_ref_type_enm: null,
    });
  } else {
    const rows = input.target.map((memId) => ({
      team_id: teamId,
      mem_id: memId,
      noti_type_enm: "adm_cust",
      noti_nm: input.notiNm,
      noti_cont: input.notiCont ?? null,
    }));
    await db.from("noti_mst").insert(rows);
  }

  return { ok: true as const, message: null };
}
