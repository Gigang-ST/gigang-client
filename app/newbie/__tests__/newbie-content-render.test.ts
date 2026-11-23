import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NewbieContent } from "@/app/newbie/newbie-content";
import { GIGANG_NEWBIE_ACTIVITIES, GIGANG_NEWBIE_SECTIONS } from "@/lib/__fixtures__/gigang-newbie-guide";
import { getTeamSignup } from "@/lib/team-signup";

/**
 * 신입 가입 안내(가입 위저드 1단계) — 팀별로 그려 본다(#658·#748).
 * 기강은 팀 설정의 운영 안내(정기 러닝·회칙·등급표)까지 6단계, 모비는 설정이 비어 있으면 가입 단계·시작 버튼만 5단계로 서고
 * 「기강」·양재천·86년생·러닝 프로필이 남지 않는다. 칩·칸은 팀 설정(`newbie.*`)을 따른다.
 */
function text(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const GIGANG_GUIDE = { activities: GIGANG_NEWBIE_ACTIVITIES, sections: GIGANG_NEWBIE_SECTIONS };
const EMPTY_GUIDE = { activities: [], sections: [] };

describe("신입 가입 안내", () => {
  it("기강은 예전 그대로 — 인사·6단계·운영 안내·둘러보기", () => {
    const t = text(
      renderToStaticMarkup(createElement(NewbieContent, { crewName: "기강", signup: getTeamSignup("gigang"), guide: GIGANG_GUIDE })),
    );
    expect(t).toContain("기강에 잘 오셨어요");
    expect(t).toContain("러닝 프로필은 건너뛰어도 돼요");
    expect(t).toContain("가까운 역·거리·페이스");
    expect(t).toContain("1/6");
    expect(t).toContain("기강이 더 궁금하다면");
    expect(t).toContain("양재천");
    expect(t).toContain("이런 활동을 해요");
    expect(t).toContain("모임 안전수칙");
    expect(t).toContain("최고존엄");
    expect(t).toContain("기강 둘러보기");
  });

  it("울산(모비)은 설정이 비어 있으면 크루 이름 인사 + 러닝 프로필 없는 5단계만, 기강 운영 안내가 없다", () => {
    const t = text(
      renderToStaticMarkup(createElement(NewbieContent, { crewName: "모비", signup: getTeamSignup("ulsan"), guide: EMPTY_GUIDE })),
    );
    expect(t).toContain("모비에 잘 오셨어요");
    expect(t).toContain("모비 둘러보기");
    expect(t).toContain("시작하기");
    expect(t).toContain("1/5");
    expect(t).not.toContain("이런 활동을 해요");
    expect(t).not.toContain("더 궁금하다면");
    for (const word of ["러닝 프로필", "가까운 역", "기강", "양재천", "86년생", "회칙", "최고존엄", "winsu"]) {
      expect(t).not.toContain(word);
    }
  });

  it("칸은 팀 설정을 따른다 — 숨긴 칸은 안 보이고, 모비도 칸을 쓰면 「더 알아보기」가 선다", () => {
    const guide = {
      activities: ["⛰️ 산행"],
      sections: [
        { title: "산행 안전수칙", icon: "safety" as const, body: "- **헤드랜턴** 필수", visible: true },
        { title: "숨긴 칸", icon: "info" as const, body: "비밀", visible: false },
      ],
    };
    const t = text(renderToStaticMarkup(createElement(NewbieContent, { crewName: "모비", signup: getTeamSignup("ulsan"), guide })));
    expect(t).toContain("이런 활동을 해요");
    expect(t).toContain("⛰️ 산행");
    expect(t).toContain("모비가 더 궁금하다면");
    expect(t).toContain("산행 안전수칙");
    expect(t).toContain("헤드랜턴");
    expect(t).not.toContain("숨긴 칸");
  });
});
