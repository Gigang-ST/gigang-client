import { describe, expect, it } from "vitest";

import { DISALLOWED_PREFIXES } from "@/lib/seo/indexable-routes";
import { AI_CRAWLERS, buildRobots } from "@/lib/seo/robots";

/** robots 규칙 회귀 테스트(#695) — 약관 공개·AI 크롤러 허용·팀별 사이트맵. */
describe("buildRobots", () => {
  const robots = buildRobots("https://gigang.team");
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

  it("/terms·/privacy는 막지 않는다 (Google 브랜드 인증 링크)", () => {
    expect(DISALLOWED_PREFIXES).not.toContain("/terms");
    expect(DISALLOWED_PREFIXES).not.toContain("/privacy");
  });

  it("로그인 필요 화면·API·관리자·/projects는 계속 막는다", () => {
    for (const p of ["/api/", "/auth/", "/admin", "/profile", "/settings", "/projects"]) {
      expect(DISALLOWED_PREFIXES).toContain(p);
    }
  });

  it("AI 크롤러는 공개 지면과 /llms.txt를 허용하고 일반 크롤러와 같은 목록을 막는다", () => {
    const ai = rules.find((r) => Array.isArray(r.userAgent) && r.userAgent.includes("GPTBot"));
    expect(ai).toBeDefined();
    expect(ai?.userAgent).toEqual([...AI_CRAWLERS]);
    expect(ai?.allow).toContain("/llms.txt");
    expect(ai?.disallow).toEqual(DISALLOWED_PREFIXES);
    for (const bot of ["GPTBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "CCBot"]) {
      expect(AI_CRAWLERS).toContain(bot);
    }
  });

  it("사이트맵·호스트는 들어온 팀 주소를 가리킨다", () => {
    expect(robots.sitemap).toBe("https://gigang.team/sitemap.xml");
    const ulsan = buildRobots("https://ulsan.gigang.team");
    expect(ulsan.sitemap).toBe("https://ulsan.gigang.team/sitemap.xml");
    expect(ulsan.host).toBe("https://ulsan.gigang.team");
  });

  it("주소를 모르면 사이트맵·호스트 없이 규칙만 낸다", () => {
    const none = buildRobots(null);
    expect(none.sitemap).toBeUndefined();
    expect(none.host).toBeUndefined();
  });
});
