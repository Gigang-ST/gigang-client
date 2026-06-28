"use server";

import { revalidateTag } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { withAdminOrThrow } from "@/lib/actions/auth";
import { BOARD_POSTS_TAG } from "@/lib/queries/board";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createPostSchema } from "@/lib/validations/board";

export async function createPost(input: {
  post_type_enm: "notice" | "update";
  post_nm: string;
  post_cont: string;
  pin_yn: boolean;
}) {
  return withAdminOrThrow(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const parsed = createPostSchema.parse({ ...input, team_id: teamId });

    const { data: post, error } = await admin
      .from("brd_post_mst")
      .insert({
        team_id: parsed.team_id, post_type_enm: parsed.post_type_enm,
        post_nm: parsed.post_nm, post_cont: parsed.post_cont,
        writ_mem_id: member.id, pin_yn: parsed.pin_yn,
      })
      .select("post_id")
      .single();

    if (error || !post) throw new Error("게시글 등록에 실패했습니다.");

    revalidateTag(BOARD_POSTS_TAG, "max");
    return { post_id: post.post_id };
  });
}
