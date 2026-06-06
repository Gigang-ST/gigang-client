"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function cancelTransaction(txnId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: txn } = await db
    .from("fee_txn_hist")
    .select("txn_id, is_cfm_yn, fee_item_cd, mem_id, cfm_at")
    .eq("txn_id", txnId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();

  if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
  if (!txn.is_cfm_yn) return { ok: false as const, message: "확정되지 않은 거래입니다." };

  // 재계산에 이미 반영된 건인지 확인 (회비 거래만 해당)
  if (txn.fee_item_cd === "due" && txn.mem_id && txn.cfm_at) {
    const { data: snap } = await db
      .from("fee_mem_bal_snap")
      .select("last_calc_at")
      .eq("team_id", teamId)
      .eq("mem_id", txn.mem_id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();

    if (snap?.last_calc_at && txn.cfm_at <= snap.last_calc_at) {
      return {
        ok: false as const,
        message: "이미 재계산에 반영된 거래입니다. 스냅샷을 먼저 이 거래 이전으로 롤백하세요.",
        needsRollback: true as const,
      };
    }
  }

  // fee_txn_hist 확정 취소
  const { error: txnErr } = await db
    .from("fee_txn_hist")
    .update({ is_cfm_yn: false, cfm_by_mem_id: null, cfm_at: null })
    .eq("txn_id", txnId);

  if (txnErr) return { ok: false as const, message: "확정 취소에 실패했습니다." };

  // due인 경우 납부 원장도 취소
  if (txn.fee_item_cd === "due") {
    const { error: payErr } = await db
      .from("fee_due_pay_hist")
      .update({ pay_st_cd: "cancelled" })
      .eq("src_txn_id", txnId)
      .eq("pay_st_cd", "paid");

    if (payErr) return { ok: false as const, message: "납부 원장 취소에 실패했습니다." };
  }

  return { ok: true as const, message: null };
}
