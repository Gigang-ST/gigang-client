import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttendancePledgeStep } from "@/components/auth/attendance-pledge-step";
import { pledgeEmptyLines, pledgeRecommendLine, regularIntroLine } from "@/lib/regular-intro";

/** 가입 「참석 약속」 정기 모임 안내 — 팀 설정 gathering.regular_intro(2026-11-27). 예전엔 「격주 수요일」이 모든 팀에 박혀 있었다 */
describe("정기 모임 안내 문장", () => {
  it("기강 — 정기런(격주 수요일 저녁)", () => {
    expect(regularIntroLine("정기런", "격주 수요일 저녁")).toBe("정기런(격주 수요일 저녁)을 추천해요");
    expect(pledgeEmptyLines({ name: "정기런", when: "격주 수요일 저녁" })).toEqual({
      next: "다음 정기런이 열리면 가장 먼저 알려드릴게요 🏃",
      when: { before: "정기런은 ", when: "격주 수요일 저녁", after: "에 열려요." },
    });
  });

  it("조사는 이름 받침을 따른다 — 「정기 모임을」·「정기 모임이」", () => {
    expect(regularIntroLine("정기 모임", "매달 둘째 주 금요일")).toBe("정기 모임(매달 둘째 주 금요일)을 추천해요");
    expect(regularIntroLine("산행", "토요일")).toBe("산행(토요일)을 추천해요");
    expect(regularIntroLine("벙", "토요일")).toBe("벙(토요일)을 추천해요");
    expect(regularIntroLine("모임데이", "토요일")).toBe("모임데이(토요일)를 추천해요");
  });

  it("설정이 없으면 요일을 지어내지 않는다", () => {
    expect(pledgeRecommendLine(null)).toBe("가까운 모임에 한 번 나와 보세요.");
    expect(pledgeEmptyLines(null)).toEqual({ next: "다음 모임이 열리면 가장 먼저 알려드릴게요 🏃", when: null });
  });

  it("참석 약속 화면에 기강 문구가 박혀 있지 않다", () => {
    const html = renderToStaticMarkup(
      createElement(AttendancePledgeStep, {
        gatherings: [],
        regularIntro: { name: "정기 모임", when: "매달 둘째 주 금요일" },
        onComplete: () => {},
        submitting: false,
      }),
    );
    expect(html).toContain("정기 모임(매달 둘째 주 금요일)을 추천해요");
    expect(html).not.toContain("격주");
    expect(html).not.toContain("정기런");
  });
});
