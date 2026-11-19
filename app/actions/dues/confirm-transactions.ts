"use server";

import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { confirmTransactionsCore, type ConfirmItem } from "@/lib/dues/confirm-core";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 여러 거래를 한 번의 서버 호출로 일괄 확정한다. 규칙·롤백은 `lib/dues/confirm-core.ts`
 * (클라이언트 주입식 — 운영 MCP 와 공유)에 있고, 이 액션은 세션 신원·팀 해석만 맡는다.
 */
export async function confirmTransactions(items: ConfirmItem[]) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    return confirmTransactionsCore(createAdminClient(), { teamId, actorMemId: member.id, items });
  });
}
