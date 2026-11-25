import { AboutPage } from "@/components/about/about-page";

/**
 * 기강 소개 페이지(#752) — 서울 기강 전용. 다른 팀 주소에선 proxy가 그 팀 홈으로 보낸다
 * (`TEAM_ONLY_PATHS`, `lib/team-host.ts`). 글·사진은 `lib/about/content.ts`.
 * 스플래시 인트로(`/intro`)와는 별개 지면이다.
 */
export default function AboutRoute() {
  return <AboutPage />;
}
