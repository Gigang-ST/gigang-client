import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GIGANG_COPY, ULSAN_COPY } from "@/lib/__fixtures__/team-copy";
import { StoryLegalFooter } from "@/components/story/story-legal-footer";
import { josa } from "@/lib/josa";
import { resolveFooterContacts } from "@/lib/legal-docs";
import { buildTeamCopy } from "@/lib/team-copy";

const text = (html: string) => html.replace(/<[^>]+>/g, "");

const gigangContacts = resolveFooterContacts({ teamCd: "gigang", operator: "이현근 (크루장)", contact: "team.gigang@gmail.com" });
const ulsanContacts = resolveFooterContacts({ teamCd: "ulsan", operator: "송창준", contact: null });

/** 홈 판권면(#746) — Google 브랜드 인증(#651)이 서버 HTML 에서 찾는 것: 앱 목적 · 받는 정보 · 방침/약관 링크 */
describe("StoryLegalFooter", () => {
  for (const [name, copy, contacts] of [
    ["기강", GIGANG_COPY, gigangContacts],
    ["울산", ULSAN_COPY, ulsanContacts],
  ] as const) {
    it(`${name}: 약관 셋·소개·받는 정보·©를 서버 렌더에 싣고 팀 이름을 따른다`, () => {
      const html = renderToStaticMarkup(createElement(StoryLegalFooter, { copy, contacts }));
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
      expect(html).toContain('href="/policy"');
      expect(text(html)).toContain("이메일·이름·프로필 사진");
      expect(text(html)).toContain(copy.serviceIntro);
      expect(text(html)).toContain(`© `);
      expect(text(html)).toContain(copy.orgName);
    });
  }

  it("기강 소개는 심사를 통과한 문장 그대로(2026-11-17)", () => {
    expect(GIGANG_COPY.serviceIntro).toBe(
      "기강은 러닝 모임과 대회·기록을 한곳에서 관리하는 크루 서비스예요. 모임 일정을 확인하고 참석을 신청하며, 대회 출전과 개인 기록을 남기고 함께 나눌 수 있어요.",
    );
  });

  it("조사는 이름 받침을 따른다 — 「{이름}은」 고정이 아니다", () => {
    expect(ULSAN_COPY.serviceIntro.startsWith(`${josa(ULSAN_COPY.crewName, "은/는")} `)).toBe(true);
    expect(ULSAN_COPY.serviceIntro).not.toContain("기강");
    const mobi = buildTeamCopy({ teamCd: "newteam", crewName: "모비", memberNoun: null });
    expect(mobi.serviceIntro.startsWith("모비는 ")).toBe(true);
  });

  it("모임 종류가 없는 팀은 종목을 지어내지 않는다 — 「{이름}는 모임과」", () => {
    const neutral = buildTeamCopy({ teamCd: "newteam", crewName: "모비", memberNoun: null });
    expect(neutral.serviceIntro.startsWith("모비는 모임과 대회·기록을")).toBe(true);
  });

  it("운영·문의는 약관과 같은 값 — 운영 주체가 어디에도 없으면 줄째 없다", () => {
    expect(gigangContacts).toEqual({ operator: "이현근 (크루장)", contact: "team.gigang@gmail.com" });
    // 기강은 설정을 못 읽어도 약관과 같은 코드 기본값으로 남는다
    expect(resolveFooterContacts({ teamCd: "gigang", operator: null, contact: null })).toEqual(gigangContacts);
    const none = resolveFooterContacts({ teamCd: "newteam", operator: null, contact: null });
    expect(none).toEqual({ operator: null, contact: null });
    const html = renderToStaticMarkup(createElement(StoryLegalFooter, { copy: ULSAN_COPY, contacts: none }));
    expect(html).not.toContain("<dl"); // 「운영 정책」 링크와 헷갈리지 않게 줄 묶음(dl)째로 본다
    expect(text(html)).not.toContain("문의");
  });
});
