import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NewbieContent } from "@/app/newbie/newbie-content";

/**
 * 신입 가입 안내(가입 위저드 1단계) — 팀별로 그려 본다(#658).
 * 기강은 운영 안내(정기 러닝·회칙·등급표)까지, 다른 팀은 가입 단계·시작 버튼만 서고 「기강」·양재천·86년생이 남지 않는다.
 */
function text(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

describe("신입 가입 안내", () => {
  it("기강은 예전 그대로 — 인사·운영 안내·둘러보기", () => {
    const t = text(renderToStaticMarkup(createElement(NewbieContent, { crewName: "기강", crewGuide: true })));
    expect(t).toContain("기강에 잘 오셨어요");
    expect(t).toContain("기강이 더 궁금하다면");
    expect(t).toContain("양재천");
    expect(t).toContain("이런 활동을 해요");
    expect(t).toContain("기강 둘러보기");
  });

  it("울산(모비)은 크루 이름으로 인사하고 기강 운영 안내를 싣지 않는다", () => {
    const t = text(renderToStaticMarkup(createElement(NewbieContent, { crewName: "모비", crewGuide: false })));
    expect(t).toContain("모비에 잘 오셨어요");
    expect(t).toContain("모비 둘러보기");
    expect(t).toContain("시작하기");
    for (const word of ["기강", "양재천", "86년생", "회칙", "최고존엄", "winsu"]) {
      expect(t).not.toContain(word);
    }
  });
});
