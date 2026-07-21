"use server";

import { revalidateTag } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { withAdminOrThrow } from "@/lib/actions/auth";
import { BOARD_POSTS_CACHE_TAG, boardPostCacheTag } from "@/lib/queries/board";

export async function deletePost(postId: string) {
  return withAdminOrThrow(async () => {
    const admin = createUntypedAdminClient();
    const { error } = await admin.from("brd_post_mst").update({ del_yn: true }).eq("post_id", postId);
    if (error) throw new Error("게시글 삭제에 실패했습니다.");
    // 목록 + 해당 글 상세 캐시 무효화 (삭제된 글의 상세는 다음 조회 시 notFound 처리됨)
    revalidateTag(BOARD_POSTS_CACHE_TAG, "max");
    revalidateTag(boardPostCacheTag(postId), "max");
  });
}
