import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getBoardPost } from "@/lib/queries/board";
import { PostForm } from "@/components/board/post-form";

export const metadata = { title: "게시글 수정" };

export default async function BoardEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getBoardPost(id);
  if (!post) notFound();

  const { member } = await getCurrentMember();
  if (!member) redirect("/");

  const { teamId } = await getRequestTeamContext();

  const canEdit = member.admin || member.id === post.writ_mem_id;
  if (!canEdit) redirect(`/board/${id}`);

  return <PostForm teamId={teamId} initialData={post} />;
}
