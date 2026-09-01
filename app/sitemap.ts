import type { MetadataRoute } from "next";

import { SITE_URL } from "@/config";
import { DEFAULT_FALLBACK_TEAM_ID } from "@/lib/constants/gigang-team";
import { getCachedBoardPosts } from "@/lib/queries/board";
import { INDEXABLE_ROUTES } from "@/lib/seo/indexable-routes";

/**
 * `/sitemap.xml` — 색인 대상 공개 지면 목록.
 *
 * 이 사이트는 로그인 뒤가 본체라 외부에서 걸린 링크가 거의 없다. 크롤러가 공개 지면을
 * 스스로 발견할 경로가 사실상 없다는 뜻이라, 사이트맵이 유일한 안내판이다.
 *
 * ⚠ `lib/supabase/public-paths.ts` 에 `/sitemap.xml` 이 있어야 이 라우트가 산다 —
 * proxy matcher 가 `.xml` 을 제외하지 않아 미들웨어를 타고, 허용 목록에 없으면
 * 쿠키 없는 크롤러 요청이 /auth/login 으로 302 된다(`/llms.txt` 가 겪었던 고장).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes = INDEXABLE_ROUTES.map(
    ({ path, changeFrequency, priority }) => ({
      url: new URL(path, SITE_URL).toString(),
      // 지면 대부분이 DB 에서 매번 바뀌는 화면이라 문서별 최종 수정시각을 정직하게 뽑을
      // 방법이 없다. 거짓 과거 날짜를 박는 것보다 현재 시각이 낫다.
      lastModified: now,
      changeFrequency,
      priority,
    }),
  );

  return [...staticRoutes, ...(await boardPostRoutes())];
}

/**
 * 게시글(`/board/{id}`) — 공지·업데이트는 지면마다 제목이 다른 실제 콘텐츠라 색인 대상이다.
 *
 * 목록 페이지가 20건 + 무한스크롤이라 **21번째 글부터는 크롤러가 따라갈 링크가 없다**
 * (`components/board/post-list.tsx`). 사이트맵이 그 구멍을 메우는 유일한 경로다.
 *
 * 조회가 실패해도 사이트맵 전체를 죽이지 않는다 — 정적 목록만이라도 나가는 편이
 * 500 을 돌려주는 것보다 낫다(크롤러는 500 을 받으면 사이트맵을 통째로 버린다).
 */
async function boardPostRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const [notices, updates] = await Promise.all([
      getCachedBoardPosts(DEFAULT_FALLBACK_TEAM_ID, "notice"),
      getCachedBoardPosts(DEFAULT_FALLBACK_TEAM_ID, "update"),
    ]);

    return [...notices, ...updates].map((post) => ({
      url: new URL(`/board/${post.post_id}`, SITE_URL).toString(),
      lastModified: new Date(post.upd_at ?? post.crt_at),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    }));
  } catch (error) {
    console.error("[sitemap] 게시글 목록 조회 실패 — 정적 경로만 낸다", error);
    return [];
  }
}
