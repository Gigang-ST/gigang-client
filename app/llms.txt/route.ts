import { getCachedLlmsUpcoming } from "@/lib/queries/llms-upcoming";
import { getSiteTeam } from "@/lib/queries/site-metadata";
import { composeLlmsTxt } from "@/lib/seo/llms/upcoming";
import { getTeamSite } from "@/lib/team-site";

/**
 * `/llms.txt` — LLM·에이전트용 사이트 안내문(llms.txt 규약). **들어온 주소의 팀** 것만 낸다.
 *
 * 예전엔 `public/llms.txt` 정적 파일이라 주소와 상관없이 기강 소개가 나갔다. 정적 파일은 주소마다 다른 내용을 줄 수
 * 없어 라우트로 바꿨다(2026-11-10). 본문은 팀 파일 표(`lib/team-site.ts` 의 `llmsTxt`) — **없는 팀은 404**
 * (다른 팀 소개를 내보내느니 없는 게 낫다).
 *
 * 본문 = 정적 소개(`llmsTxt`) + 그 팀의 「다가오는 일정」(`getCachedLlmsUpcoming` — 팀 id 로만 조회, 1시간 캐시).
 * 일정은 **본문이 있는 팀에서만** 조회한다 — 404 팀은 DB 를 안 건드리고, 팀 사이에 일정이 섞일 길이 없다.
 *
 * AI 크롤러가 가끔 받아 가는 파일이라 함수 호출은 무시할 수준이고, CDN 이 주소별로 하루 들고 있는다.
 * ⚠ `lib/supabase/public-paths.ts` 에 `/llms.txt` 가 있어야 쿠키 없는 요청이 로그인으로 302 되지 않는다.
 */
export async function GET() {
  const team = await getSiteTeam();
  const staticBody = team ? getTeamSite(team.teamCd).llmsTxt : undefined;
  if (!team || !staticBody) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const body = composeLlmsTxt(staticBody, await getCachedLlmsUpcoming(team.teamId));
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
