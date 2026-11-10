"use server";

import { revalidatePath } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { adminUpdateStatusSchema, type FeedbackStatus } from "@/lib/validations/feedback";

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  return withAdmin(async () => {
    const parsed = adminUpdateStatusSchema.safeParse({ status });
    if (!parsed.success) return { ok: false, message: "잘못된 상태값입니다." };

    // 이 팀 건의만 — service_role 이라 id 만 받으면 다른 팀 건의도 바뀐다
    const { teamId } = await getRequestTeamContext();
    const db = createUntypedAdminClient();
    const { data, error } = await db
      .from("fdbk_mst")
      .update({ stts_enm: parsed.data.status })
      .eq("fdbk_id", id)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .select("fdbk_id");

    if (error) return { ok: false, message: "상태 변경에 실패했습니다." };
    if (!data?.length) return { ok: false, message: "건의를 찾을 수 없습니다." };

    revalidatePath("/admin/feedback");
    return { ok: true, message: null };
  });
}
