"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { dayjs } from "@/lib/dayjs";
import { withMember } from "@/lib/actions/auth";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { createSchPostSchema, updateSchPostSchema } from "@/lib/validations/schedule";

function toUtcIso(localDt: string | null | undefined): string | null {
  if (!localDt) return null;
  return dayjs.tz(localDt, "Asia/Seoul").toISOString();
}

export async function createSchPost(input: {
  sch_nm: string;
  post_type?: string;
  evt_stt_at: string;
  evt_end_at?: string | null;
  url?: string | null;
  cont_txt?: string | null;
}) {
  return withMember(async ({ member, supabase }) => {
    const { teamId } = await getRequestTeamContext();
    const parsed = createSchPostSchema.parse({ ...input, team_id: teamId });

    const { data, error } = await supabase
      .from("sch_post_mst")
      .insert({
        team_id: parsed.team_id, sch_nm: parsed.sch_nm,
        post_type: parsed.post_type ?? "general",
        evt_stt_at: toUtcIso(parsed.evt_stt_at)!,
        evt_end_at: toUtcIso(parsed.evt_end_at),
        url: parsed.url || null, cont_txt: parsed.cont_txt ?? null,
        crt_by: member.id, vers: 0, del_yn: false,
      })
      .select("sch_post_id, short_id")
      .single();

    if (error || !data) throw new Error("일정 등록에 실패했습니다.");

    const postId = data.sch_post_id;
    const authorId = member.id;
    const postName = parsed.sch_nm;

    after(async () => {
      try {
        const admin = createUntypedAdminClient();

        const { data: members } = await admin
          .from("team_mem_rel")
          .select("mem_id")
          .eq("team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false)
          .neq("mem_id", authorId);

        if (!members?.length) return;

        // 인앱+푸시 한 몸. pref 수신거부 필터는 관문(insertNotiMany)이 처리.
        await insertNotiMany({
          teamId,
          memIds: members.map((m) => m.mem_id),
          notiTypeEnm: "sch_post_new",
          notiNm: `${dayjs().format("M월 D일")} 새 정보가 등록됐습니다.`,
          notiCont: postName,
          refId: data.short_id ?? postId,
          refTypeEnm: "sch_post",
        });
      } catch (e) {
        console.error("[sch_post_new] 알림 발송 실패", e);
      }
    });

    revalidatePath("/");
    return { sch_post_id: postId };
  });
}

export async function updateSchPost(input: {
  sch_post_id: string;
  sch_nm?: string;
  post_type?: string;
  evt_stt_at?: string;
  evt_end_at?: string | null;
  url?: string | null;
  cont_txt?: string | null;
}) {
  return withMember(async ({ supabase }) => {
    const parsed = updateSchPostSchema.parse(input);
    const { sch_post_id, ...fields } = parsed;

    const { error } = await supabase
      .from("sch_post_mst")
      .update({
        ...fields,
        evt_stt_at: fields.evt_stt_at ? toUtcIso(fields.evt_stt_at)! : undefined,
        evt_end_at: fields.evt_end_at !== undefined ? toUtcIso(fields.evt_end_at) : undefined,
        url: fields.url || null,
        upd_at: dayjs().toISOString(),
      })
      .eq("sch_post_id", sch_post_id);

    if (error) throw new Error("수정 권한이 없거나 일정 수정에 실패했습니다.");

    revalidatePath("/");
  });
}

export async function deleteSchPost(sch_post_id: string) {
  return withMember(async ({ member, supabase }) => {
    const { data: post } = await supabase
      .from("sch_post_mst")
      .select("crt_by, team_id")
      .eq("sch_post_id", sch_post_id)
      .single();
    if (!post) throw new Error("일정을 찾을 수 없습니다.");

    const isAuthor = post.crt_by === member.id;
    if (!isAuthor && !member.admin) throw new Error("삭제 권한이 없습니다.");

    const admin = createUntypedAdminClient();
    const { error } = await admin
      .from("sch_post_mst")
      .update({ del_yn: true, upd_at: dayjs().toISOString() })
      .eq("sch_post_id", sch_post_id);
    if (error) throw new Error("일정 삭제에 실패했습니다.");

    revalidatePath("/");
  });
}
