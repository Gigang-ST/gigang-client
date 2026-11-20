"use server";

import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { recalculateBalanceCore } from "@/lib/dues/recalc-core";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 회원 잔액 재계산 — 앵커(개시잔액) + 전체 리플레이 방식. 계산 본체는 `lib/dues/recalc-core.ts`
 * (클라이언트 주입식 — 운영 MCP 와 공유). 이 액션은 세션 신원·팀 해석만 맡는다.
 */
export async function recalculateBalance(memIds?: string[]) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    return recalculateBalanceCore(createAdminClient(), { teamId, actorMemId: member.id, memIds });
  });
}
