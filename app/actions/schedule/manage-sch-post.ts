"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { dayjs } from "@/lib/dayjs";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { createSchPostSchema, updateSchPostSchema } from "@/lib/validations/schedule";

export async function createSchPost(input: {
  sch_nm: string;
  post_type?: string;
  evt_stt_at: string;
  evt_end_at?: string | null;
  url?: string | null;
  cont_txt?: string | null;
}) {
  const { member, supabase } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  const { teamId } = await getRequestTeamContext();
  const parsed = createSchPostSchema.parse({ ...input, team_id: teamId });

  const { data, error } = await supabase
    .from("sch_post_mst")
    .insert({
      team_id: parsed.team_id,
      sch_nm: parsed.sch_nm,
      post_type: parsed.post_type ?? "general",
      evt_stt_at: parsed.evt_stt_at,
      evt_end_at: parsed.evt_end_at ?? null,
      url: parsed.url || null,
      cont_txt: parsed.cont_txt ?? null,
      crt_by: member.id,
      vers: 0,
      del_yn: false,
    })
    .select("sch_post_id")
    .single();

  if (error || !data) throw new Error("일정 등록에 실패했습니다.");

  const postId = data.sch_post_id;
  const authorId = member.id;
  const postName = parsed.sch_nm;

  after(async () => {
    try {
      const admin = createUntypedAdminClient();

      // 팀 전체 활성 멤버 조회 (작성자 제외)
      const { data: members } = await admin
        .from("team_mem_rel")
        .select("mem_id")
        .eq("team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false)
        .neq("mem_id", authorId);

      if (!members?.length) return;

      // 알림 설정 확인 후 발송 대상 필터링
      const { data: disabledPrefs } = await admin
        .from("noti_pref_cfg")
        .select("mem_id")
        .in("mem_id", members.map((m) => m.mem_id))
        .eq("noti_type_enm", "sch_post_new")
        .eq("enabled_yn", false);

      const disabledSet = new Set((disabledPrefs ?? []).map((p) => p.mem_id));
      const targets = members.filter((m) => !disabledSet.has(m.mem_id));

      if (!targets.length) return;

      await admin.from("noti_mst").insert(
        targets.map((m) => ({
          team_id: teamId,
          mem_id: m.mem_id,
          noti_type_enm: "sch_post_new",
          noti_nm: `${dayjs().format("M월 D일")} 새 피드가 등록됐습니다.`,
          noti_cont: postName,
          ref_id: postId,
          ref_type_enm: "sch_post",
        })),
      );
    } catch (e) {
      console.error("[sch_post_new] 알림 발송 실패", e);
    }
  });

  revalidatePath("/");
  return { sch_post_id: postId };
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
  const { member, supabase } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  const parsed = updateSchPostSchema.parse(input);
  const { sch_post_id, ...fields } = parsed;

  const { error } = await supabase
    .from("sch_post_mst")
    .update({ ...fields, url: fields.url || null, upd_at: dayjs().toISOString() })
    .eq("sch_post_id", sch_post_id);

  if (error) throw new Error("수정 권한이 없거나 일정 수정에 실패했습니다.");

  revalidatePath("/");
}

export async function deleteSchPost(sch_post_id: string) {
  const { member, supabase } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  const { error } = await supabase
    .from("sch_post_mst")
    .update({ del_yn: true, upd_at: dayjs().toISOString() })
    .eq("sch_post_id", sch_post_id);

  if (error) throw new Error("삭제 권한이 없거나 일정 삭제에 실패했습니다.");

  revalidatePath("/");
}
