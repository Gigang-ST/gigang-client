import { notFound } from "next/navigation";
import { getCachedBoardPost } from "@/lib/queries/board";
import { PostDetail } from "@/components/board/post-detail";

/**
 * 상세 페이지는 첫 요청 시 렌더 후 unstable_cache 로 캐시.
 * 게시글 수정/삭제 시 revalidateTag("board-post:{id}") 로 무효화.
 */
export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const post = await getCachedBoardPost(id);
  if (!post) notFound();

  return <PostDetail post={post} />;
}
