import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { PostForm } from "@/components/board/post-form";

export const metadata = { title: "게시글 작성" };

export default async function BoardWritePage() {
  const { member } = await getCurrentMember();
  if (!member || !member.admin) redirect("/board");

  const { teamId } = await getRequestTeamContext();

  return <PostForm teamId={teamId} />;
}
