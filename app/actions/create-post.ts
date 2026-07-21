"use server";

import { revalidateTag } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { withAdminOrThrow } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { BOARD_POSTS_CACHE_TAG } from "@/lib/queries/board";
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

    // 목록 캐시 무효화 (새 글이라 상세 태그는 아직 없음). DB 트리거도 동일 태그를 치지만
    // 앱에서 즉시 무효화해 작성 직후 목록에 바로 반영되도록 한다(트리거 웹훅은 비동기).
    revalidateTag(BOARD_POSTS_CACHE_TAG, "max");
    return { post_id: post.post_id };
  });
}
