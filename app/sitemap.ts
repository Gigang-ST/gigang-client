import type { MetadataRoute } from "next";

import { dayjs } from "@/lib/dayjs";
import { getCachedBoardPostRefs } from "@/lib/queries/board";
import { getSiteTeam } from "@/lib/queries/site-metadata";
import { INDEXABLE_ROUTES } from "@/lib/seo/indexable-routes";

/**
 * `/sitemap.xml` — 색인 대상 공개 지면 목록. **들어온 주소의 팀** 기준 — 주소는 그 팀 정식 주소로, 게시글은 그 팀 글만.
 * 예전엔 기강 주소·기강 글 고정이라 울산 주소의 사이트맵이 기강 지면을 안내했다(2026-11-10 팀별로).
 *
 * 이 사이트는 로그인 뒤가 본체라 외부에서 걸린 링크가 거의 없다. 크롤러가 공개 지면을
 * 스스로 발견할 경로가 사실상 없다는 뜻이라, 사이트맵이 유일한 안내판이다.
 *
 * ⚠ `lib/supabase/public-paths.ts` 에 `/sitemap.xml` 이 있어야 이 라우트가 산다 —
 * proxy matcher 가 `.xml` 을 제외하지 않아 미들웨어를 타고, 허용 목록에 없으면
 * 쿠키 없는 크롤러 요청이 /auth/login 으로 302 된다(`/llms.txt` 가 겪었던 고장).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const team = await getSiteTeam();
  // 모르는 주소는 proxy 가 먼저 404 로 끊는다 — 그래도 오면 빈 목록(다른 팀 지면을 안내하지 않는다)
  if (!team?.canonicalOrigin) return [];
  const origin = team.canonicalOrigin;
  const now = dayjs().toDate();

  const staticRoutes = INDEXABLE_ROUTES.map(
    ({ path, changeFrequency, priority }) => ({
      url: new URL(path, origin).toString(),
      // 지면 대부분이 DB 에서 매번 바뀌는 화면이라 문서별 최종 수정시각을 정직하게 뽑을
      // 방법이 없다. 거짓 과거 날짜를 박는 것보다 현재 시각이 낫다.
      lastModified: now,
      changeFrequency,
      priority,
    }),
  );

  return [...staticRoutes, ...(await boardPostRoutes(team.teamId, origin))];
}

/**
 * 게시글(`/board/{id}`) — 공지·업데이트는 지면마다 제목이 다른 실제 콘텐츠라 색인 대상이다.
 *
 * 목록 화면은 20건씩 무한스크롤이라 크롤러가 21번째 글부터는 따라갈 링크가 없다
 * (`components/board/post-list.tsx`). 그래서 여기서는 목록용 조회가 아니라 **전량을 주는**
 * `getCachedBoardPostRefs` 를 쓴다 — 목록용을 그대로 쓰면 사이트맵도 20건에서 잘려
 * 구멍을 못 메운다.
 *
 * 조회가 실패해도 사이트맵 전체를 죽이지 않는다 — 정적 목록만이라도 나가는 편이
 * 500 을 돌려주는 것보다 낫다(크롤러는 500 을 받으면 사이트맵을 통째로 버린다).
 */
async function boardPostRoutes(teamId: string, origin: string): Promise<MetadataRoute.Sitemap> {
  try {
    const posts = await getCachedBoardPostRefs(teamId);

    return posts.map((post) => ({
      url: new URL(`/board/${post.post_id}`, origin).toString(),
      lastModified: dayjs(post.upd_at ?? post.crt_at).toDate(),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    }));
  } catch (error) {
    console.error("[sitemap] 게시글 목록 조회 실패 — 정적 경로만 낸다", error);
    return [];
  }
}
