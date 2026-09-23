"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function deleteNotification(notiId: string) {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    // ⚠️ 에러를 삼키지 않는다 — `deleteAllNotifications`와 같은 이유다. 화면은 낙관적으로
    // 먼저 지우는데(§mutateNotifications), 여기서 실패를 감추면 **지워지지 않았는데 지워진
    // 것처럼 보이고** store가 세션 내내 살아 있어 그 거짓이 그대로 남는다. 호출부의
    // 복원·토스트는 전부 이 throw를 기다린다 — 안 던지면 그 경로가 통째로 죽는다.
    const { error } = await admin
      .from("noti_mst")
      .update({ del_yn: true })
      .eq("noti_id", notiId)
      .eq("mem_id", member.id);
    if (error) throw error;
  });
}
