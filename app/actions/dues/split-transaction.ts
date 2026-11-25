"use server";

import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { recalculateBalanceCore } from "@/lib/dues/recalc-core";
import { splitConfirmCore } from "@/lib/dues/split-core";
import type { SplitLine } from "@/lib/dues/split-lines";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 거래 한 건을 금액으로 나눠 줄마다 다른 분류·대상으로 확정하고(#754), 줄에 걸린 회원 잔액을 재계산한다.
 * 규칙·롤백은 `lib/dues/split-core.ts`, 이 액션은 세션 신원·팀 해석과 재계산 연결만 맡는다.
 */
export async function splitAndConfirm(input: { txnId: string; lines: SplitLine[] }) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const split = await splitConfirmCore(db, { teamId, actorMemId: member.id, txnId: input.txnId, lines: input.lines });
    if (!split.ok) return { ok: false as const, message: split.message };

    if (split.memIds.length === 0) return { ok: true as const, message: null, recalculated: 0 };
    const recalc = await recalculateBalanceCore(db, { teamId, actorMemId: member.id, memIds: split.memIds });
    if (!recalc.ok) {
      return {
        ok: false as const,
        message: `나눠 확정은 완료됐으나 잔액 재계산에 실패했습니다. 잔액 원장에서 '전체 재계산'을 실행하세요. (${recalc.message})`,
      };
    }
    return { ok: true as const, message: null, recalculated: recalc.updatedCount };
  });
}
