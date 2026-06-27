"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 제외(소프트 삭제, del_yn=true)된 거래를 복구한다.
 * - del_yn 을 false 로 되돌려 거래내역에 다시 노출.
 * - 같은 지문(team_id, txn_dt, txn_tm, txn_amt, raw_name)의 살아있는 거래가 이미 있으면
 *   중복방지 유니크 인덱스에 걸려 복구 불가 → 안내.
 */
export async function restoreTransaction(txnId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: txn } = await db
      .from("fee_txn_hist")
      .select("txn_id, del_yn")
      .eq("txn_id", txnId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
    if (!txn.del_yn) return { ok: false as const, message: "이미 사용 중인 거래입니다." };

    // 복구는 항상 "미확정" 상태로 되돌린다 (다시 검토·확정 대상이 되도록).
    const { error } = await db
      .from("fee_txn_hist")
      .update({ del_yn: false, is_cfm_yn: false, cfm_by_mem_id: null, cfm_at: null })
      .eq("txn_id", txnId)
      .eq("team_id", teamId);

    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, message: "동일한 거래(일시·금액·이름)가 이미 있어 복구할 수 없습니다." };
      }
      return { ok: false as const, message: "복구에 실패했습니다." };
    }

    return { ok: true as const, message: null };
  });
}
