"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function rollbackXlsx(updId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: upd } = await db.from("fee_xlsx_upd_hist").select("upd_id, upd_st_cd, file_nm").eq("upd_id", updId).eq("team_id", teamId).eq("del_yn", false).maybeSingle();
    if (!upd) return { ok: false as const, message: "업로드 이력을 찾을 수 없습니다." };

    const { count: confirmedCount } = await db.from("fee_txn_hist").select("txn_id", { count: "exact", head: true }).eq("upd_id", updId).eq("is_cfm_yn", true).eq("del_yn", false);
    if ((confirmedCount ?? 0) > 0) return { ok: false as const, message: `이미 확정된 거래 ${confirmedCount}건이 포함되어 있습니다. 확정 취소 후 롤백하세요.` };

    // 삭제될 미확정 거래 수 (요약 표시용)
    const { count: deletedCount } = await db.from("fee_txn_hist").select("txn_id", { count: "exact", head: true }).eq("upd_id", updId).eq("is_cfm_yn", false);

    // 롤백 = 하드 딜리트. 행 자체를 제거해 같은 엑셀 재업로드 시 정상 재유입되도록 한다.
    // (차단 삭제 deleteTransaction 은 소프트 삭제로 재유입을 막는 것과 의도가 다르다.)
    const { error: txnErr } = await db.from("fee_txn_hist").delete().eq("upd_id", updId).eq("is_cfm_yn", false);
    if (txnErr) return { ok: false as const, message: "거래 롤백 중 오류가 발생했습니다." };

    const { error: updHistErr } = await db.from("fee_xlsx_upd_hist").delete().eq("upd_id", updId);
    if (updHistErr) return { ok: false as const, message: "업로드 이력 롤백 중 오류가 발생했습니다." };

    return { ok: true as const, message: null, fileNm: upd.file_nm, deletedCount: deletedCount ?? 0 };
  });
}
