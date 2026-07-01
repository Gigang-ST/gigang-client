"use server";

import { confirmTransactions, type ConfirmItem } from "@/app/actions/dues/confirm-transactions";
import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";
import { learnAliases } from "@/app/actions/dues/learn-aliases";

/**
 * 거래 확정 흐름을 한 번의 호출로 묶는 오케스트레이터.
 * (1) 거래 확정 → 실패 시 중단 → (2) 별칭 학습(있으면, 실패해도 무시) →
 * (3) 잔액 재계산.
 *
 * 별칭 학습은 반드시 확정 성공 뒤에 한다 — 확정이 거부되면 실제로 반영되지 않은
 * 판단이 다음 업로드의 자동매칭 규칙으로 남는 것을 막기 위함.
 *
 * 이 함수 자체는 `withAdmin`으로 감싸지 않는다 — 호출하는 세 액션이 각각
 * 이미 `withAdmin`으로 감싸져 있어 권한 체크가 중복될 필요가 없다.
 */
export async function confirmAndRecalc(input: {
  items: ConfirmItem[];
  aliasLearn?: { rawName: string; memId: string }[];
  recalcMemIds?: string[];
}) {
  const confirm = await confirmTransactions(input.items);
  if (!confirm.ok) {
    return { ok: false as const, message: confirm.message, confirmed: 0, recalculated: 0 };
  }

  if (input.aliasLearn?.length) {
    // 확정 성공 후에만 학습. 실패해도 재계산은 진행하되, 조용히 삼키지 않고 로그를 남긴다.
    const aliasResult = await learnAliases(input.aliasLearn);
    if (!aliasResult.ok) {
      console.error("[confirmAndRecalc] 별칭 학습 실패:", aliasResult.message);
    }
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
