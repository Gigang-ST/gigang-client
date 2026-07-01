"use server";

import { confirmTransactions, type ConfirmItem } from "@/app/actions/dues/confirm-transactions";
import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";
import { learnAliases } from "@/app/actions/dues/learn-aliases";

/**
 * 거래 확정 흐름을 한 번의 호출로 묶는 오케스트레이터.
 * (1) 별칭 학습(있으면, 실패해도 무시) → (2) 거래 확정 → 실패 시 중단 →
 * (3) 잔액 재계산.
 *
 * 이 함수 자체는 `withAdmin`으로 감싸지 않는다 — 호출하는 세 액션이 각각
 * 이미 `withAdmin`으로 감싸져 있어 권한 체크가 중복될 필요가 없다.
 */
export async function confirmAndRecalc(input: {
  items: ConfirmItem[];
  aliasLearn?: { rawName: string; memId: string }[];
  recalcMemIds?: string[];
}) {
  if (input.aliasLearn?.length) {
    await learnAliases(input.aliasLearn); // 학습 실패는 치명적이지 않음(확정 진행)
  }

  const confirm = await confirmTransactions(input.items);
  if (!confirm.ok) {
    return { ok: false as const, message: confirm.message, confirmed: 0, recalculated: 0 };
  }

  const recalc = await recalculateBalance(input.recalcMemIds);
  if (!recalc.ok) {
    return {
      ok: false as const,
      message: `확정은 완료됐으나 잔액 재계산에 실패했습니다. 다시 시도하세요. (${recalc.message})`,
      confirmed: confirm.confirmed,
      recalculated: 0,
    };
  }

  return { ok: true as const, message: null, confirmed: confirm.confirmed, recalculated: recalc.updatedCount };
}
