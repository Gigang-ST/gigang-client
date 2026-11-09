"use server";

import { revalidateTag } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { withAdminOrThrow } from "@/lib/actions/auth";
import { BOARD_POSTS_CACHE_TAG, boardPostCacheTag } from "@/lib/queries/board";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export async function deletePost(postId: string) {
  return withAdminOrThrow(async () => {
    // 접속한 팀의 글만 — service_role 이라 RLS 가 없어서 id 만으로 지우면 다른 팀 공지도 지워진다
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();
    const { data: deleted, error } = await admin
      .from("brd_post_mst")
      .update({ del_yn: true })
      .eq("post_id", postId)
      .eq("team_id", teamId)
      .select("post_id");
    if (error) throw new Error("게시글 삭제에 실패했습니다.");
    if (!deleted || deleted.length === 0) throw new Error("게시글을 찾을 수 없습니다.");
    // 목록 + 해당 글 상세 캐시 무효화 (삭제된 글의 상세는 다음 조회 시 notFound 처리됨)
    revalidateTag(BOARD_POSTS_CACHE_TAG, "max");
    revalidateTag(boardPostCacheTag(postId), "max");
  });
}
