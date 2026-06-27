"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { getValidFeeItemCds } from "./validate-fee-item";

export type ConfirmItem = {
  txnId: string;
  /** 확정과 함께 적용할 분류(미확정 상태에서 로컬로 바꾼 값). 없으면 기존 분류 유지. */
  feeItemCd?: string | null;
  /** 확정과 함께 적용할 회원 매칭(로컬로 바꾼 값). 없으면 기존 매칭 유지. */
  memId?: string | null;
};

/**
 * 여러 거래를 한 번의 서버 호출로 일괄 확정한다.
 * 확정 직전에 (로컬에서 바뀐) 분류·매칭을 함께 반영하므로,
 * 분류 변경마다 별도 서버 왕복을 할 필요가 없다.
 *
 * 규칙:
 *  - 분류(fee_item_cd)가 있어야 확정 가능
 *  - 회비(due) + 매칭 + mem_id 인 경우에만 납부원장(fee_due_pay_hist) 생성 → 개인잔액 반영
 *  - 회비 미매칭은 확정만 되고 개인잔액 미반영
 *  - 이미 확정/삭제된 건은 건너뜀
 */
export async function confirmTransactions(items: ConfirmItem[]) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!items.length) return { ok: true as const, message: null, confirmed: 0, skipped: 0 };

    const itemMap = new Map(items.map((it) => [it.txnId, it]));
    const txnIds = items.map((it) => it.txnId);

    // 대상 거래 일괄 조회
    const { data: txns, error: selErr } = await db
      .from("fee_txn_hist")
      .select("txn_id, mem_id, txn_amt, txn_dt, fee_item_cd, is_cfm_yn, match_st_cd")
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .in("txn_id", txnIds);

    if (selErr) return { ok: false as const, message: "거래 조회에 실패했습니다." };

    // 로컬 변경(분류·매칭)을 병합한 "확정 시점의 최종 상태" 계산
    const validCds = await getValidFeeItemCds(db);
    const merged = (txns ?? [])
      .filter((t) => !t.is_cfm_yn)
      .map((t) => {
        const it = itemMap.get(t.txn_id);
        const feeItemCd = it?.feeItemCd ?? t.fee_item_cd;
        // 매칭을 새로 지정했으면 matched 로 승격
        const memId = it?.memId !== undefined && it.memId !== null ? it.memId : t.mem_id;
        const matchStCd = it?.memId ? "matched" : t.match_st_cd;
        return { ...t, fee_item_cd: feeItemCd, mem_id: memId, match_st_cd: matchStCd };
      });

    // 분류 유효성 검증 — 무효 분류가 있으면 전체 거부 (잘못된 확정 방지)
    const invalid = merged.find((t) => !t.fee_item_cd || !validCds.has(t.fee_item_cd));
    if (invalid) {
      return { ok: false as const, message: "분류가 없거나 유효하지 않은 거래가 있습니다." };
    }

    const skipped = txnIds.length - merged.length;
    if (merged.length === 0) {
      return { ok: true as const, message: null, confirmed: 0, skipped };
    }

    const nowIso = new Date().toISOString();

    // 1) 거래별로 분류·매칭이 다를 수 있으므로, 변경이 있는 건만 개별 UPDATE 후 확정.
    //    (분류/매칭 변경이 없는 건은 묶어서 단일 UPDATE)
    const changed = merged.filter((t) => {
      const it = itemMap.get(t.txn_id);
      return it?.feeItemCd != null || (it?.memId != null);
    });
    const unchanged = merged.filter((t) => !changed.includes(t));

    // 변경 있는 건: 분류·매칭·확정을 한 번에 반영
    for (const t of changed) {
      const { error } = await db
        .from("fee_txn_hist")
        .update({
          fee_item_cd: t.fee_item_cd,
          mem_id: t.mem_id,
          match_st_cd: t.match_st_cd,
          is_cfm_yn: true,
          cfm_by_mem_id: member.id,
          cfm_at: nowIso,
        })
        .eq("team_id", teamId)
        .eq("txn_id", t.txn_id)
        .eq("is_cfm_yn", false);
      if (error) return { ok: false as const, message: "확정 처리에 실패했습니다." };
    }

    // 변경 없는 건: 단일 UPDATE 로 일괄 확정
    if (unchanged.length > 0) {
      const { error: updErr } = await db
        .from("fee_txn_hist")
        .update({ is_cfm_yn: true, cfm_by_mem_id: member.id, cfm_at: nowIso })
        .eq("team_id", teamId)
        .eq("is_cfm_yn", false)
        .in("txn_id", unchanged.map((t) => t.txn_id));
      if (updErr) return { ok: false as const, message: "확정 처리에 실패했습니다." };
    }

    // 2) 회비 + 매칭 건만 납부원장 일괄 생성 (단일 INSERT)
    const payRows = merged
      .filter((t) => t.fee_item_cd === "due" && t.match_st_cd === "matched" && t.mem_id)
      .map((t) => ({
        team_id: teamId,
        mem_id: t.mem_id!,
        src_txn_id: t.txn_id,
        pay_amt: t.txn_amt,
        pay_dt: t.txn_dt,
        pay_st_cd: "paid",
        vers: 0,
        del_yn: false,
      }));

    if (payRows.length > 0) {
      const { error: payErr } = await db.from("fee_due_pay_hist").insert(payRows);
      if (payErr) {
        // 납부원장 생성 실패 시 확정 롤백 (정합성 보호)
        await db
          .from("fee_txn_hist")
          .update({ is_cfm_yn: false, cfm_by_mem_id: null, cfm_at: null })
          .eq("team_id", teamId)
          .in("txn_id", merged.map((t) => t.txn_id));
        return { ok: false as const, message: "납부 원장 저장에 실패했습니다. 확정을 취소했습니다." };
      }
    }

    return { ok: true as const, message: null, confirmed: merged.length, skipped };
  });
}
