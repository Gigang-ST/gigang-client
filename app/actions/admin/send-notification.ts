"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export type NotiTypeEnm = "adm_cust" | "dues_notice" | "cmnt_reply" | "cmnt_mention";

export async function sendNotification(input: {
  target: "all" | string[];
  notiNm: string;
  notiCont?: string | null;
  notiTypeEnm?: NotiTypeEnm;
}) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createUntypedAdminClient();
    const batchId = crypto.randomUUID();
    const notiTypeEnm = input.notiTypeEnm ?? "adm_cust";

    if (input.target === "all") {
      const { error } = await db.rpc("create_noti_for_team", {
        p_team_id: teamId,
        p_noti_type_enm: notiTypeEnm,
        p_noti_nm: input.notiNm,
        p_noti_cont: input.notiCont ?? null,
        p_ref_id: null,
        p_ref_type_enm: null,
        p_batch_id: batchId,
      });
      if (error) return { ok: false as const, message: "알림 발송에 실패했습니다." };
    } else {
      const rows = input.target.map((memId) => ({
        team_id: teamId,
        mem_id: memId,
        noti_type_enm: notiTypeEnm,
        noti_nm: input.notiNm,
        noti_cont: input.notiCont ?? null,
        batch_id: batchId,
      }));
      const { error } = await db.from("noti_mst").insert(rows);
      if (error) return { ok: false as const, message: "알림 발송에 실패했습니다." };
    }

    return { ok: true as const, message: null, batchId };
  });
}
