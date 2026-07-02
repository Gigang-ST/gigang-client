"use server";

import { dayjs } from "@/lib/dayjs";

import { withAdmin } from "@/lib/actions/auth";
import { LEDGER_EPOCH } from "@/lib/dues/ledger-replay";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";

/**
 * 확정된 거래 1건을 취소한다 — 처리됨 목록의 되돌리기(undo) 경로.
 *
 * 1) 거래를 미확정으로 되돌려 인박스로 복귀시키고
 * 2) 회비였으면 납부원장 행을 cancelled 로 표시한 뒤
 * 3) 해당 회원 잔액을 리플레이 재계산으로 복구한다.
 *
 * 재계산이 앵커+전체 리플레이 방식(recalculateBalance 참조)이라 취소·재확정이
 * 몇 번 반복돼도 잔액은 항상 원천 데이터와 일치한다. 유일한 예외는 앵커(개시잔액)에
 * 녹아 있는 원장 전환 이전 납부 — 리플레이 범위 밖이므로 취소를 거부한다.
 */
export async function cancelTransaction(txnId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: txn } = await db
      .from("fee_txn_hist")
      .select("txn_id, is_cfm_yn, fee_item_cd, mem_id, txn_dt, txn_tm")
      .eq("txn_id", txnId)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .maybeSingle();
    if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
    if (!txn.is_cfm_yn) return { ok: false as const, message: "확정되지 않은 거래입니다." };

    // 앵커(개시잔액) 이전 납부는 리플레이로 복구할 수 없으므로 취소 불가
    if (txn.fee_item_cd === "due" && txn.mem_id) {
      const { data: anchor } = await db
        .from("fee_mem_bal_snap")
        .select("last_calc_at")
        .eq("team_id", teamId)
        .eq("mem_id", txn.mem_id)
        .eq("del_yn", false)
        .lt("crt_at", dayjs(LEDGER_EPOCH).toISOString())
        .order("crt_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (anchor?.last_calc_at) {
        const txnAt = dayjs.tz(`${txn.txn_dt}T${txn.txn_tm ?? "00:00:00"}`, "Asia/Seoul");
        if (!txnAt.isAfter(dayjs(anchor.last_calc_at))) {
          return {
            ok: false as const,
            message: "원장 전환 이전 개시잔액에 포함된 거래라 취소할 수 없습니다.",
          };
        }
      }
    }

    const { error: txnErr } = await db
      .from("fee_txn_hist")
      .update({ is_cfm_yn: false, cfm_by_mem_id: null, cfm_at: null })
      .eq("team_id", teamId)
      .eq("txn_id", txnId);
    if (txnErr) return { ok: false as const, message: "확정 취소에 실패했습니다." };

    if (txn.fee_item_cd === "due") {
      const { error: payErr } = await db
        .from("fee_due_pay_hist")
        .update({ pay_st_cd: "cancelled" })
        .eq("team_id", teamId)
        .eq("src_txn_id", txnId)
        .eq("pay_st_cd", "paid");
      if (payErr) {
        return {
          ok: false as const,
          message: "납부 원장 취소에 실패했습니다. 다시 시도하세요.",
        };
      }
    }

    if (txn.mem_id) {
      const recalc = await recalculateBalance([txn.mem_id]);
      if (!recalc.ok) {
        // 데이터는 이미 취소됨(정합) — 스냅샷만 낡은 상태. 재계산은 리플레이라
        // 다음 아무 재계산(원장의 전체 재계산, 인박스 확정 포함)이든 성공하면 복구된다.
        // raw DB 에러는 화면에 올리지 않고 로그로만 남긴다.
        console.error("[cancelTransaction] 취소 후 재계산 실패:", recalc.message);
        return {
          ok: false as const,
          message: "취소는 됐지만 잔액 재계산에 실패했습니다. 잔액 원장에서 '전체 재계산'을 실행하면 복구됩니다.",
        };
      }
    }

    return { ok: true as const, message: null };
  });
}
