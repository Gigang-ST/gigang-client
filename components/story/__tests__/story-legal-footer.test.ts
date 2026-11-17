import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GIGANG_COPY, ULSAN_COPY } from "@/lib/__fixtures__/team-copy";
import { StoryLegalFooter } from "@/components/story/story-legal-footer";

/** 홈 안내문 — Google 브랜드 인증(#651)이 서버 HTML 에서 찾는 것: 앱 목적 · 받는 정보 · 방침/약관 링크 */
describe("StoryLegalFooter", () => {
  for (const [name, copy] of [
    ["기강", GIGANG_COPY],
    ["울산", ULSAN_COPY],
  ] as const) {
    it(`${name}: 소개·받는 정보·링크를 서버 렌더에 싣고 팀 이름을 따른다`, () => {
      const html = renderToStaticMarkup(createElement(StoryLegalFooter, { copy }));
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
      expect(html).toContain("이메일, 이름, 프로필 사진");
      expect(html).toContain(copy.crewName);
    });
  }
});
