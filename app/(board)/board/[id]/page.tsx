import { notFound } from "next/navigation";
import { getCachedBoardPost } from "@/lib/queries/board";
import { PostDetail } from "@/components/board/post-detail";

// 게시판 상세는 공개 온디맨드 캐시 페이지. 읽음 처리·권한 계산은 클라에서 서버액션으로 수행한다.
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
