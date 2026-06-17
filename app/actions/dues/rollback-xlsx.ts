"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function rollbackXlsx(updId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: upd } = await db
    .from("fee_xlsx_upd_hist")
    .select("upd_id, upd_st_cd")
    .eq("upd_id", updId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();

  if (!upd) return { ok: false as const, message: "업로드 이력을 찾을 수 없습니다." };

  // 확정된 거래 있는지 확인
  const { count } = await db
    .from("fee_txn_hist")
    .select("txn_id", { count: "exact", head: true })
    .eq("upd_id", updId)
    .eq("is_cfm_yn", true)
    .eq("del_yn", false);

  if ((count ?? 0) > 0) {
    return { ok: false as const, message: `이미 확정된 거래 ${count}건이 포함되어 있습니다. 확정 취소 후 롤백하세요.` };
  }

  // 미확정 거래 soft-delete
  await db
    .from("fee_txn_hist")
    .update({ del_yn: true })
    .eq("upd_id", updId)
    .eq("is_cfm_yn", false);

  // 업로드 상태 rolled_back + del_yn=true (재업로드 허용을 위해 vers=0 해제)
  await db
    .from("fee_xlsx_upd_hist")
    .update({ upd_st_cd: "rolled_back", del_yn: true })
    .eq("upd_id", updId);

  return { ok: true as const, message: null };
}
