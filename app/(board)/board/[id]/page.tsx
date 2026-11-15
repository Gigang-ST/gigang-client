import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedBoardPost } from "@/lib/queries/board";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getSiteMetaInput } from "@/lib/queries/site-metadata";
import { boardPostDescription } from "@/lib/seo/board-post-meta";
import { siteOpenGraphBase } from "@/lib/seo/site-metadata";
import { PostDetail } from "@/components/board/post-detail";

/**
 * 게시글마다 고유한 제목·설명을 준다.
 *
 * 없으면 모든 글이 루트 metadata를 물려받아 **제목이 전부 같은 문서**가 된다 —
 * 네이버 웹마스터 가이드의 「동일한 제목인 웹문서 다수 발견」·「동일 설명문 발견」이
 * 정확히 이 경우고, 검색로봇이 어느 글을 띄울지 못 정해 노출에서 밀린다.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [{ teamId }, site] = await Promise.all([getRequestTeamContext(), getSiteMetaInput()]);
  const post = await getCachedBoardPost(teamId, id);
  if (!post) return { title: "글을 찾을 수 없습니다", robots: { index: false } };

  return {
    title: post.post_nm,
    description: boardPostDescription(post.post_cont, post.post_nm),
    alternates: { canonical: `/board/${id}` },
    openGraph: {
      // openGraph 를 세우면 루트 것이 통째로 덮여서 사이트 이름·썸네일을 여기서 다시 깐다
      // (예전엔 `app/opengraph-image.png` 파일 규칙이 지면마다 따로 붙여 줬다).
      ...(site ? siteOpenGraphBase(site) : {}),
      type: "article",
      title: post.post_nm,
      description: boardPostDescription(post.post_cont, post.post_nm),
      publishedTime: post.crt_at,
      modifiedTime: post.upd_at,
    },
  };
}

// 게시판 상세는 공개 온디맨드 캐시 페이지. 읽음 처리·권한 계산은 클라에서 서버액션으로 수행한다.
// 접속한 팀의 글만 연다 — 다른 팀 글 id 는 없는 글(404)과 같다.
export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { teamId } = await getRequestTeamContext();

  const post = await getCachedBoardPost(teamId, id);
  if (!post) notFound();

  return <PostDetail post={post} />;
}
