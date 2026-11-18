import type { MetadataRoute } from "next";

import { getSiteTeam } from "@/lib/queries/site-metadata";
import { buildRobots } from "@/lib/seo/robots";

/**
 * `/robots.txt` — 크롤러 정책과 사이트맵 위치. **들어온 주소의 팀** 기준이다(울산 주소면 울산 사이트맵을 가리킨다).
 * 예전엔 기강 주소 고정이라 울산 주소의 robots 가 기강 사이트맵을 안내했다(2026-11-10 팀별로).
 * 규칙 본문(AI 크롤러 허용 포함)은 `lib/seo/robots.ts` — 테스트가 순수 함수로 지킨다.
 *
 * 이게 없으면 `/robots.txt` 요청이 Next.js not-found로 떨어져 **HTML이 200으로**
 * 응답한다(소프트 404). 네이버 서치어드바이저는 robots.txt를 별도 검증 항목으로
 * 두고 사이트맵도 여기서 찾으므로, 없는 것보다 명시하는 쪽이 안전하다.
 *
 * 요청 주소를 읽어서 정적 파일이 아니라 요청마다 만든다 — 크롤러만 가끔 받아 가는 파일이라 함수 호출은 무시할 수준이다.
 *
 * ⚠ 이 라우트가 살려면 `lib/supabase/public-paths.ts`에 `/robots.txt`가 있어야 한다 —
 * proxy matcher가 `.txt`를 제외하지 않아 미들웨어를 타고, 허용 목록에 없으면
 * 쿠키 없는 크롤러 요청이 /auth/login으로 302된다(`/llms.txt`가 겪었던 고장).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const team = await getSiteTeam();
  return buildRobots(team?.canonicalOrigin ?? null);
}
