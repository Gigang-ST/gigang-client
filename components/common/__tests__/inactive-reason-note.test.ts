import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InactiveReasonNote } from "@/components/common/inactive-reason-note";

/**
 * 사유 칸이 **없을 때 아무것도 안 그리는지**. 크래시가 없는 종류라 눈으로만 지키면
 * 라벨만 덩그러니 남은 빈 상자가 게이트 다이얼로그·프로필탭에 조용히 서게 된다.
 */

const render = (reason: string | null) =>
  renderToStaticMarkup(createElement(InactiveReasonNote, { reason }));

describe("InactiveReasonNote", () => {
  it("사유가 있으면 라벨과 본문을 함께 그린다", () => {
    const html = render("3개월 이상 모임 미참여");
    expect(html).toContain("비활성 사유");
    expect(html).toContain("3개월 이상 모임 미참여");
  });

  it("사유가 없으면 라벨도 상자도 그리지 않는다", () => {
    expect(render(null)).toBe("");
  });

  it("줄바꿈은 살린다 — 관리자가 여러 줄로 적을 수 있다", () => {
    expect(render("사유")).toContain("whitespace-pre-wrap");
  });
});
