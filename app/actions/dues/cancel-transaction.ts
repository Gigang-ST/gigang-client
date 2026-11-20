"use server";

import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { cancelTransactionCore } from "@/lib/dues/cancel-core";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 확정된 거래 1건을 취소한다 — 처리됨 목록의 되돌리기(undo) 경로.
 * 본체(미확정 복귀 → 납부원장 cancelled → 잔액 리플레이 재계산)는 `lib/dues/cancel-core.ts`
 * (클라이언트 주입식 — 운영 MCP 와 공유). 이 액션은 세션 신원·팀 해석만 맡는다.
 */
export async function cancelTransaction(txnId: string) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    return cancelTransactionCore(createAdminClient(), { teamId, actorMemId: member.id, txnId });
  });
}
