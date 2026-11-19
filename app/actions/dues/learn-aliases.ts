"use server";

import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { learnAliasesCore, type AliasLearnItem } from "@/lib/dues/learn-aliases-core";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 입금자명(정규화) → 회원 매핑을 `fee_payer_alias`에 학습시킨다.
 * 다음 업로드부터 같은 입금자명이 자동 매칭된다. 본체는 `lib/dues/learn-aliases-core.ts`
 * (클라이언트 주입식 — 운영 MCP 와 공유).
 */
export async function learnAliases(items: AliasLearnItem[]) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    return learnAliasesCore(createAdminClient(), { teamId, actorMemId: member.id, items });
  });
}
