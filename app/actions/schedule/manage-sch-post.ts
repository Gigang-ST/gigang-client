"use server";

import { revalidatePath } from "next/cache";

import { dayjs } from "@/lib/dayjs";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
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

  revalidatePath("/");
  return { sch_post_id: data.sch_post_id };
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
