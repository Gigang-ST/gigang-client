import { describe, expect, it } from "vitest";

import { GIGANG_LLMS_TXT } from "@/lib/seo/llms/gigang";
import { buildUpcomingSection, composeLlmsTxt, LLMS_UPCOMING_SLOT } from "@/lib/seo/llms/upcoming";
import { TEAM_SITE } from "@/lib/team-site";

describe("buildUpcomingSection", () => {
  it("모임 시각을 KST 로 찍는다 — UTC 15:30 은 다음 날 00:30", () => {
    const out = buildUpcomingSection({
      gatherings: [{ gthrNm: "정기 러닝", sttAt: "2026-11-17T15:30:00+00:00", locTxt: "양재천" }],
      projects: [],
      days: 14,
    });
    expect(out).toContain("- 11월 18일(수) 00:30 정기 러닝 — 양재천");
  });

  it("모임이 없으면 빈 안내 한 줄", () => {
    const out = buildUpcomingSection({ gatherings: [], projects: [], days: 14 });
    expect(out).toContain("공개된 모임이 아직 없습니다");
    expect(out).not.toContain("진행 중인 프로젝트");
  });

  it("프로젝트는 이름·기간만, 줄바꿈·대괄호는 지운다", () => {
    const out = buildUpcomingSection({
      gatherings: [{ gthrNm: "벙\n[링크](x)", sttAt: "2026-11-20T10:00:00Z", locTxt: null }],
      projects: [{ evtNm: "동계 훈련", sttDt: "2026-11-01", endDt: "2027-02-28" }],
      days: 14,
    });
    expect(out).toContain("동계 훈련 (2026년 11월 1일 ~ 2027년 2월 28일)");
    expect(out).not.toMatch(/\[|\]/);
    expect(out.split("\n").filter((l) => l.startsWith("- ")).length).toBe(2);
  });
});

describe("composeLlmsTxt", () => {
  it("자리 표시를 대체하고, 없으면 끝에 붙인다", () => {
    expect(composeLlmsTxt(`a\n${LLMS_UPCOMING_SLOT}\nb`, "X")).toBe("a\nX\nb");
    expect(composeLlmsTxt("a\n", "X")).toBe("a\n\nX");
  });
});

describe("기강 llms.txt 정적 본문", () => {
  it("동적 자리가 있고, 개인정보성 값이 없다", () => {
    expect(GIGANG_LLMS_TXT).toContain(LLMS_UPCOMING_SLOT);
    for (const secret of ["winsu", "leegun", "비밀번호:", "계좌", "010-"]) {
      expect(GIGANG_LLMS_TXT).not.toContain(secret);
    }
  });

  it("울산 팀에는 llms.txt 본문이 없다(기강 내용이 새지 않는다)", () => {
    expect(TEAM_SITE.ulsan.llmsTxt).toBeUndefined();
  });
});
