"use server";

import { withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function markBoardTypeRead(type: "notice" | "update") {
  return withMember(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const { data: posts } = await admin.from("brd_post_mst").select("post_id").eq("team_id", teamId).eq("post_type_enm", type).eq("del_yn", false);

    if (!posts || posts.length === 0) return;

    const postIds = posts.map((p: { post_id: string }) => p.post_id);
    const { data: alreadyRead } = await admin.from("brd_post_read_hist").select("post_id").eq("mem_id", member.id).in("post_id", postIds);

    const readSet = new Set((alreadyRead ?? []).map((r: { post_id: string }) => r.post_id));
    const unreadIds = postIds.filter((id: string) => !readSet.has(id));

    if (unreadIds.length === 0) return;

    await admin.from("brd_post_read_hist").insert(unreadIds.map((post_id: string) => ({ post_id, mem_id: member.id })));
  });
}
