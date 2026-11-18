import type { MetadataRoute } from "next";

import { DISALLOWED_PREFIXES } from "@/lib/seo/indexable-routes";

/**
 * 공개 지면과 `/llms.txt`를 읽게 둘 AI 크롤러(2026-11 오너 결정, #695).
 *
 * 규칙은 일반 크롤러(`*`)와 **같다** — 로그인 필요 화면·API·관리자는 똑같이 막힌다.
 * 기본 규칙(`*`)만으로도 열려 있지만, 이름을 적어 두면 "허용하기로 한 봇"이 파일에 눈에 보이고
 * 나중에 `*`를 좁혀도 이 봇들이 의도 없이 같이 닫히는 걸 리뷰에서 잡을 수 있다.
 * 봇 이름이 적힌 그룹이 있으면 그 봇에게 `*` 그룹은 적용되지 않으므로, **막는 목록도 이 그룹에 다시 넣는다**.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
] as const;

/**
 * 팀 정식 주소(`https://gigang.team`) 기준 robots 규칙. 주소를 모르면(`null`) 사이트맵·호스트 줄 없이 규칙만 낸다.
 * 울산도 같은 규칙이고 사이트맵·호스트만 울산 주소를 가리킨다.
 */
export function buildRobots(origin: string | null): MetadataRoute.Robots {
  const disallow = [...DISALLOWED_PREFIXES];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // 네이버 Yeti는 명시적으로 한 번 더 허용해 둔다. 기본 규칙으로도 열리지만,
      // 서치어드바이저 robots.txt 검증에서 대상 봇이 눈에 보이는 편이 낫다.
      { userAgent: "Yeti", allow: "/", disallow },
      { userAgent: [...AI_CRAWLERS], allow: ["/", "/llms.txt"], disallow },
    ],
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
