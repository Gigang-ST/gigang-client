import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { PostForm } from "@/components/board/post-form";

export const metadata = { title: "게시글 작성" };

export default async function BoardWritePage() {
  const { member } = await getCurrentMember();
  if (!member) redirect("/");

  const { teamId } = await getRequestTeamContext();

  let canWrite = member.admin ?? false;
  if (!canWrite) {
    const admin = createUntypedAdminClient();
    const { data } = await admin
      .from("team_mem_rel")
      .select("post_yn")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .single();
    canWrite = (data as { post_yn?: boolean } | null)?.post_yn === true;
  }

  if (!canWrite) redirect("/board");

  return <PostForm teamId={teamId} />;
}
