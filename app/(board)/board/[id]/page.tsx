import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getBoardPost, recordBoardPostRead } from "@/lib/queries/board";
import { PostDetail } from "@/components/board/post-detail";

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { user, member } = await getCurrentMember();
  if (!user) redirect("/auth/login");

  const post = await getBoardPost(id);
  if (!post) notFound();

  if (member) {
    await recordBoardPostRead(id, member.id);
  }

  const canEdit = Boolean(
    member && (member.admin || member.id === post.writ_mem_id),
  );

  return <PostDetail post={post} canEdit={canEdit} />;
}
