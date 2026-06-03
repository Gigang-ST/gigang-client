import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getBoardPost, recordBoardPostRead } from "@/lib/queries/board";
import { PostDetail } from "@/components/board/post-detail";

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getBoardPost(id);
  if (!post) notFound();

  const { member } = await getCurrentMember();

  // 읽음 이력 기록 (비로그인이면 skip)
  if (member) {
    await recordBoardPostRead(id, member.id);
  }

  const canEdit = Boolean(
    member && (member.admin || member.id === post.writ_mem_id),
  );

  return <PostDetail post={post} canEdit={canEdit} />;
}
