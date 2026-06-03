"use server";

import { revalidatePath } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createPostSchema } from "@/lib/validations/board";

export async function createPost(input: {
  post_type_enm: "notice" | "update";
  post_nm: string;
  post_cont: string;
  pin_yn: boolean;
}) {
  const { member } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  const { teamId } = await getRequestTeamContext();
  const admin = createUntypedAdminClient();

  // 권한 확인
  const { data: rel } = await admin
    .from("team_mem_rel")
    .select("post_yn")
    .eq("team_id", teamId)
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .single();

  const canPost = member.admin || (rel as { post_yn?: boolean } | null)?.post_yn === true;
  if (!canPost) throw new Error("게시글 작성 권한이 없습니다.");

  const parsed = createPostSchema.parse({ ...input, team_id: teamId });

  const { data: post, error } = await admin
    .from("brd_post_mst")
    .insert({
      team_id: parsed.team_id,
      post_type_enm: parsed.post_type_enm,
      post_nm: parsed.post_nm,
      post_cont: parsed.post_cont,
      writ_mem_id: member.id,
      pin_yn: parsed.pin_yn,
    })
    .select("post_id")
    .single();

  if (error || !post) throw new Error("게시글 등록에 실패했습니다.");

  // 팀 전체 알림 발송
  const notiType = parsed.post_type_enm === "notice" ? "notice_post" : "update_post";
  await admin.rpc("create_noti_for_team", {
    p_team_id: teamId,
    p_noti_type_enm: notiType,
    p_noti_nm: parsed.post_nm,
    p_noti_cont: null,
    p_ref_id: post.post_id,
    p_ref_type_enm: "brd_post",
  });

  revalidatePath("/board");
  return { post_id: post.post_id };
}
