"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function confirmTransaction(txnId: string) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: txn } = await db
      .from("fee_txn_hist")
      .select("txn_id, team_id, mem_id, txn_amt, txn_dt, fee_item_cd, is_cfm_yn, match_st_cd")
      .eq("txn_id", txnId)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .maybeSingle();

    if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
    if (txn.is_cfm_yn) return { ok: false as const, message: "이미 확정된 거래입니다." };
    if (!txn.fee_item_cd) return { ok: false as const, message: "분류를 먼저 선택해 주세요." };

    // 확정은 분류만 있으면 가능. (회비 미매칭도 확정은 되지만 개인잔액엔 반영 안 됨 — 아래 참조)
    const { error: txnErr } = await db
      .from("fee_txn_hist")
      .update({ is_cfm_yn: true, cfm_by_mem_id: member.id, cfm_at: new Date().toISOString() })
      .eq("txn_id", txnId);

    if (txnErr) return { ok: false as const, message: "확정 처리에 실패했습니다." };

    // 회비(due) + 회원 매칭된 경우에만 납부 원장 생성 → 회원 개인잔액에 반영된다.
    // 회비인데 미매칭이면 납부원장이 없어 개인잔액엔 안 들어가고 "미반영"으로 남는다.
    // (행사비·물품·지출 등 비회비 분류는 개인잔액 개념이 없어 납부원장을 만들지 않는다.)
    if (txn.fee_item_cd === "due" && txn.match_st_cd === "matched" && txn.mem_id) {
      const { error: payErr } = await db.from("fee_due_pay_hist").insert({
        team_id: teamId,
        mem_id: txn.mem_id,
        src_txn_id: txnId,
        pay_amt: txn.txn_amt,
        pay_dt: txn.txn_dt,
        pay_st_cd: "paid",
        vers: 0,
        del_yn: false,
      });
      if (payErr) return { ok: false as const, message: "납부 원장 저장에 실패했습니다." };
    }

    return { ok: true as const, message: null };
  });
}
