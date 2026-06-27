"use server";

import { withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

type SaveSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

/**
 * 현재 멤버의 푸시 구독을 저장한다 (기기당 1 row).
 * 같은 endpoint가 이미 있으면 멤버/키 정보를 갱신한다(upsert).
 */
export async function savePushSubscription(input: SaveSubscriptionInput) {
  return withMember(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();
    const { error } = await admin.from("push_sub_rel").upsert(
      {
        team_id: teamId,
        mem_id: member.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent ?? null,
      },
      { onConflict: "endpoint" },
    );
    // 저장 실패 시 throw — 클라이언트가 "켜짐"으로 오인하지 않도록(subscribePush가 error로 받음)
    if (error) throw new Error(`구독 저장 실패: ${error.message}`);
  });
}

/**
 * 현재 멤버의 특정 기기 구독을 삭제한다 (푸시 토글 OFF).
 * endpoint 기준으로 삭제하며, 본인 소유 여부도 mem_id로 한 번 더 가드한다.
 */
export async function deletePushSubscription(endpoint: string) {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    const { error } = await admin
      .from("push_sub_rel")
      .delete()
      .eq("endpoint", endpoint)
      .eq("mem_id", member.id);
    if (error) throw new Error(`구독 삭제 실패: ${error.message}`);
  });
}
