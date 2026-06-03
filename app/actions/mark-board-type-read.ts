"use server";

import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

/**
 * 팝오버 열 때 해당 타입의 모든 게시글을 읽음 처리.
 * 팝오버 목록에서 제목을 봤으면 "인지"한 것으로 간주.
 */
export async function markBoardTypeRead(type: "notice" | "update") {
  const { member } = await getCurrentMember();
  if (!member) return;

  const { teamId } = await getRequestTeamContext();
  const admin = createUntypedAdminClient();

  // 해당 타입의 미읽음 게시글 ID 조회
  const { data: posts } = await admin
    .from("brd_post_mst")
    .select("post_id")
    .eq("team_id", teamId)
    .eq("post_type_enm", type)
    .eq("del_yn", false);

  if (!posts || posts.length === 0) return;

  // 이미 읽은 항목 조회
  const postIds = posts.map((p: { post_id: string }) => p.post_id);
  const { data: alreadyRead } = await admin
    .from("brd_post_read_hist")
    .select("post_id")
    .eq("mem_id", member.id)
    .in("post_id", postIds);

  const readSet = new Set((alreadyRead ?? []).map((r: { post_id: string }) => r.post_id));
  const unreadIds = postIds.filter((id: string) => !readSet.has(id));

  if (unreadIds.length === 0) return;

  await admin.from("brd_post_read_hist").insert(
    unreadIds.map((post_id: string) => ({ post_id, mem_id: member.id })),
  );
}
