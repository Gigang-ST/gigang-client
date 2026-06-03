"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateFeeItem(
  txnId: string,
  feeItemCd: "due" | "expense" | "event_fee" | "goods" | "other",
) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: txn } = await db
    .from("fee_txn_hist")
    .select("is_cfm_yn")
    .eq("txn_id", txnId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();

  if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
  if (txn.is_cfm_yn) return { ok: false as const, message: "이미 확정된 거래는 수정할 수 없습니다." };

  const { error } = await db
    .from("fee_txn_hist")
    .update({ fee_item_cd: feeItemCd })
    .eq("txn_id", txnId);

  if (error) return { ok: false as const, message: "카테고리 변경에 실패했습니다." };
  return { ok: true as const, message: null };
}
