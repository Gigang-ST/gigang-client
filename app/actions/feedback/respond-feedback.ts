"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { insertNoti } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { adminRespondSchema } from "@/lib/validations/feedback";

export async function respondFeedback(id: string, adminNote: string) {
  return withAdmin(async () => {
    const parsed = adminRespondSchema.safeParse({ adminNote });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." };

    const { teamId } = await getRequestTeamContext();
    const db = createUntypedAdminClient();
    const { data: updated, error } = await db
      .from("fdbk_mst")
      .update({ adm_note_txt: parsed.data.adminNote ?? null, rspd_at: dayjs().toISOString() })
      .eq("fdbk_id", id)
      .eq("del_yn", false)
      .select("mem_id, cont_txt")
      .single();

    if (error) return { ok: false, message: "답변 저장에 실패했습니다." };

    // 답변이 비어있지 않을 때만 작성자에게 알림 (비차단)
    if (updated && parsed.data.adminNote) {
      after(async () => {
        try {
          const preview = updated.cont_txt.length > 40 ? `${updated.cont_txt.slice(0, 40)}…` : updated.cont_txt;
          await insertNoti({
            teamId,
            memId: updated.mem_id,
            notiTypeEnm: "fdbk_rspd",
            notiNm: "내 건의에 운영진 답변이 등록됐어요",
            notiCont: preview,
            refId: id,
            refTypeEnm: "feedback",
          });
        } catch (e) {
          console.error("[fdbk_rspd] 알림 발송 실패", e);
        }
      });
    }

    revalidatePath("/admin/feedback");
    revalidatePath("/profile/feedback");
    return { ok: true, message: null };
  });
}
