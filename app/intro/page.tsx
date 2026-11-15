import { Hero } from "@/components/intro/hero";
import { Intro } from "@/components/intro/intro";

/**
 * 서울 기강 전용 랜딩 — 사진·구호가 기강 것이라 팀 이름을 그대로 둔다. 다른 팀 주소에선 proxy가 그 팀 홈으로
 * 보낸다(`teamOnlyPathRedirect`, `lib/team-host.ts` — 2026-11-15 결정).
 */
export default function IntroPage() {
  return (
    <Intro>
      <Hero />
    </Intro>
  );
}
