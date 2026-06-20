"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function matchTransaction(txnId: string, memId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: txn } = await db.from("fee_txn_hist").select("txn_id, raw_name, is_cfm_yn").eq("txn_id", txnId).eq("team_id", teamId).eq("del_yn", false).maybeSingle();
    if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
    if (txn.is_cfm_yn) return { ok: false as const, message: "이미 확정된 거래는 수정할 수 없습니다." };

    const { data: mem } = await db.from("mem_mst").select("mem_nm").eq("mem_id", memId).eq("vers", 0).eq("del_yn", false).maybeSingle();
    if (!mem) return { ok: false as const, message: "회원을 찾을 수 없습니다." };

    const { error } = await db.from("fee_txn_hist").update({ mem_id: memId, match_st_cd: "matched" }).eq("txn_id", txnId);
    if (error) return { ok: false as const, message: "매칭 처리에 실패했습니다." };
    return { ok: true as const, message: null, match_st_cd: "matched" as const };
  });
}
