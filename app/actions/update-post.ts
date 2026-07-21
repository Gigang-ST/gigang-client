"use server";

import { revalidateTag } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { withMember } from "@/lib/actions/auth";
import { BOARD_POSTS_CACHE_TAG, boardPostCacheTag } from "@/lib/queries/board";
import { updatePostSchema } from "@/lib/validations/board";
import { getKSTDate } from "@/lib/dayjs";

export async function updatePost(input: {
  post_id: string;
  post_type_enm?: "notice" | "update";
  post_nm?: string;
  post_cont?: string;
  pin_yn?: boolean;
}) {
  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();

    const { data: existing } = await admin.from("brd_post_mst").select("writ_mem_id, team_id").eq("post_id", input.post_id).eq("del_yn", false).single();
    if (!existing) throw new Error("게시글을 찾을 수 없습니다.");

    const isAuthor = existing.writ_mem_id === member.id;
    if (!isAuthor && !member.admin) throw new Error("수정 권한이 없습니다.");

    const parsed = updatePostSchema.parse(input);

    const { error } = await admin
      .from("brd_post_mst")
      .update({
        ...(parsed.post_type_enm && { post_type_enm: parsed.post_type_enm }),
        ...(parsed.post_nm && { post_nm: parsed.post_nm }),
        ...(parsed.post_cont && { post_cont: parsed.post_cont }),
        ...(parsed.pin_yn !== undefined && { pin_yn: parsed.pin_yn }),
        upd_at: getKSTDate().toISOString(),
      })
      .eq("post_id", input.post_id);

    if (error) throw new Error("게시글 수정에 실패했습니다.");

    // 목록 + 해당 글 상세 캐시 무효화 (앱 내 수정 경로)
    revalidateTag(BOARD_POSTS_CACHE_TAG, "max");
    revalidateTag(boardPostCacheTag(input.post_id), "max");
  });
}
