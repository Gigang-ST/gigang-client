"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { withMember } from "@/lib/actions/auth";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { submitFeedbackSchema } from "@/lib/validations/feedback";

export async function submitFeedback(body: string) {
  return withMember(async ({ member }) => {
    const parsed = submitFeedbackSchema.safeParse({ body });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." };
    }

    const { teamId } = await getRequestTeamContext();
    const db = createUntypedAdminClient();
    const { data: inserted, error } = await db
      .from("fdbk_mst")
      .insert({ mem_id: member.id, cont_txt: parsed.data.body })
      .select("fdbk_id")
      .single();

    if (error) return { ok: false, message: "제출에 실패했습니다. 다시 시도해주세요." };

    // 신규 건의 → 팀 관리자 전원에게 알림 (비차단)
    after(async () => {
      try {
        const admin = createUntypedAdminClient();

        const { data: admins } = await admin
          .from("team_mem_rel")
          .select("mem_id")
          .eq("team_id", teamId)
          .in("team_role_cd", ["admin", "owner"])
          .eq("vers", 0)
          .eq("del_yn", false);

        if (!admins?.length) return;

        const preview = parsed.data.body.length > 40 ? `${parsed.data.body.slice(0, 40)}…` : parsed.data.body;

        // 인앱+푸시 한 몸. pref 수신거부 필터는 관문(insertNotiMany)이 처리.
        await insertNotiMany({
          teamId,
          memIds: admins.map((a) => a.mem_id),
          notiTypeEnm: "fdbk_new",
          notiNm: "새 건의가 등록되었어요",
          notiCont: preview,
          refId: inserted.fdbk_id,
          refTypeEnm: "feedback",
        });
      } catch (e) {
        console.error("[fdbk_new] 알림 발송 실패", e);
      }
    });

    revalidatePath("/profile/feedback");
    return { ok: true, message: null };
  });
}
