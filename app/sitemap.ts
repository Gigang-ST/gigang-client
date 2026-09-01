import type { MetadataRoute } from "next";

import { SITE_URL } from "@/config";
import { INDEXABLE_ROUTES } from "@/lib/seo/indexable-routes";

/**
 * `/sitemap.xml` — 색인 대상 공개 지면 목록.
 *
 * 이 사이트는 로그인 뒤가 본체라 외부에서 걸린 링크가 거의 없다. 크롤러가 공개
 * 지면을 스스로 발견할 경로가 사실상 없다는 뜻이라, 사이트맵이 유일한 안내판이다.
 *
 * `lastModified`는 빌드/요청 시각이다. 지면 대부분이 DB에서 매번 바뀌는 화면이라
 * 문서별 최종 수정시각을 정직하게 뽑을 방법이 없고, 거짓 과거 날짜를 박는 것보다
 * 현재 시각이 낫다. 게시글 등 문서 단위 시각이 필요해지면 그때 개별 조회로 채운다.
 *
 * ⚠ robots.ts와 같은 이유로 `lib/supabase/public-paths.ts`에 `/sitemap.xml`이 필요하다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return INDEXABLE_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified,
    changeFrequency,
    priority,
  }));
}
