"use server";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function markAllNotificationsRead() {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();
    // ⚠️ 에러를 삼키지 않는다. 화면은 낙관적으로 먼저 지우는데(§NotificationBellIcon),
    // 여기서 실패를 감추면 **쓰기가 안 됐는데 읽음 처리된 것처럼 보이고**, 그 상태가
    // 세션 내내(store가 살아 있으므로) 유지된다. 던져야 호출부가 되돌릴 수 있다.
    const { error } = await admin
      .from("noti_mst")
      .update({ read_yn: true })
      .eq("mem_id", member.id)
      .eq("del_yn", false)
      .eq("read_yn", false);
    if (error) throw error;
  });
}
