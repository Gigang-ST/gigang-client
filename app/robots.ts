import type { MetadataRoute } from "next";

import { SITE_URL } from "@/config";
import { DISALLOWED_PREFIXES } from "@/lib/seo/indexable-routes";

/**
 * `/robots.txt` — 크롤러 정책과 사이트맵 위치.
 *
 * 이게 없으면 `/robots.txt` 요청이 Next.js not-found로 떨어져 **HTML이 200으로**
 * 응답한다(소프트 404). 네이버 서치어드바이저는 robots.txt를 별도 검증 항목으로
 * 두고 사이트맵도 여기서 찾으므로, 없는 것보다 명시하는 쪽이 안전하다.
 *
 * ⚠ 이 라우트가 살려면 `lib/supabase/public-paths.ts`에 `/robots.txt`가 있어야 한다 —
 * proxy matcher가 `.txt`를 제외하지 않아 미들웨어를 타고, 허용 목록에 없으면
 * 쿠키 없는 크롤러 요청이 /auth/login으로 302된다(`/llms.txt`가 겪었던 고장).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED_PREFIXES,
      },
      // 네이버 Yeti는 명시적으로 한 번 더 허용해 둔다. 기본 규칙으로도 열리지만,
      // 서치어드바이저 robots.txt 검증에서 대상 봇이 눈에 보이는 편이 낫다.
      {
        userAgent: "Yeti",
        allow: "/",
        disallow: DISALLOWED_PREFIXES,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
