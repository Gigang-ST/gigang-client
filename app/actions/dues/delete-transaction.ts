"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 거래내역 차단 삭제 (소프트 삭제).
 * - del_yn=true 로 남겨 두어, 같은 거래가 엑셀 재업로드 시 중복방지 인덱스에 걸려
 *   재유입되지 않도록 한다. (롤백=하드딜리트와 의도 분리)
 * - 확정된 거래는 잔액에 반영되어 있으므로 먼저 확정 취소가 필요하다.
 */
export async function deleteTransaction(txnId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: txn } = await db
      .from("fee_txn_hist")
      .select("txn_id, is_cfm_yn")
      .eq("txn_id", txnId)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .maybeSingle();

    if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
    if (txn.is_cfm_yn) {
      return { ok: false as const, message: "확정된 거래입니다. 확정 취소 후 삭제하세요." };
    }

    const { error } = await db
      .from("fee_txn_hist")
      .update({ del_yn: true })
      .eq("txn_id", txnId)
      .eq("team_id", teamId);

    if (error) return { ok: false as const, message: "거래 삭제에 실패했습니다." };
    return { ok: true as const, message: null };
  });
}
