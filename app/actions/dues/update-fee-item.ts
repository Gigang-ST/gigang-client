"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { getValidFeeItemCds } from "./validate-fee-item";

// 분류 cd 는 공통코드(FEE_ITEM_CD)에서 관리되므로 string 으로 받고 런타임 검증한다.
export async function updateFeeItem(txnId: string, feeItemCd: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    // 분류 유효성: 공통코드에 존재하는 cd 인지 검증
    const validCds = await getValidFeeItemCds(db);
    if (!validCds.has(feeItemCd)) {
      return { ok: false as const, message: "존재하지 않는 분류입니다." };
    }

    const { data: txn } = await db.from("fee_txn_hist").select("is_cfm_yn").eq("txn_id", txnId).eq("team_id", teamId).eq("del_yn", false).maybeSingle();
    if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
    if (txn.is_cfm_yn) return { ok: false as const, message: "이미 확정된 거래는 수정할 수 없습니다." };

    const { error } = await db.from("fee_txn_hist").update({ fee_item_cd: feeItemCd }).eq("txn_id", txnId).eq("team_id", teamId).eq("is_cfm_yn", false).eq("del_yn", false);
    if (error) return { ok: false as const, message: "카테고리 변경에 실패했습니다." };
    return { ok: true as const, message: null };
  });
}
