"use server";

import { revalidatePath } from "next/cache";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";

export async function deletePost(postId: string) {
  const { member } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");

  if (!member.admin) throw new Error("삭제 권한이 없습니다.");

  const admin = createUntypedAdminClient();

  const { error } = await admin
    .from("brd_post_mst")
    .update({ del_yn: true })
    .eq("post_id", postId);

  if (error) throw new Error("게시글 삭제에 실패했습니다.");

  revalidatePath("/board");
}
