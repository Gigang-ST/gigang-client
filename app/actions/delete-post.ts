"use server";

import { revalidatePath } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { withAdminOrThrow } from "@/lib/actions/auth";

export async function deletePost(postId: string) {
  return withAdminOrThrow(async () => {
    const admin = createUntypedAdminClient();
    const { error } = await admin.from("brd_post_mst").update({ del_yn: true }).eq("post_id", postId);
    if (error) throw new Error("게시글 삭제에 실패했습니다.");
    revalidatePath("/board");
  });
}
