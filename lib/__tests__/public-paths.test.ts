import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/public-paths";

/**
 * 비로그인 접근 허용 경로 판정 회귀 테스트.
 *
 * `/llms.txt`는 public/ 정적 파일이지만 proxy matcher가 `.txt`를 제외하지 않아
 * 미들웨어를 탄다. 허용 목록에서 빠지면 쿠키 없는 요청이 /auth/login으로 302되어
 * 파일이 조용히 죽는다 — 눈에 안 띄는 고장이라 여기서 못박는다.
 */
describe("isPublicPath", () => {
  it("llms.txt는 비로그인으로 읽을 수 있어야 한다", () => {
    expect(isPublicPath("/llms.txt")).toBe(true);
  });

  // robots.txt·sitemap.xml도 같은 함정에 빠진다. 크롤러는 302를 에러로 안 알려주고
  // 조용히 색인을 포기하므로, 고장을 알아챌 방법이 이 테스트뿐이다.
  it.each(["/robots.txt", "/sitemap.xml"])(
    "검색엔진용 %s 은 비로그인으로 읽을 수 있어야 한다",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(true);
    },
  );

  it.each([
    "/",
    "/story",
    "/records",
    "/schedule",
    "/races",
    "/projects",
    "/rules",
    "/join",
    "/newbie",
    "/terms",
    "/privacy",
    "/policy",
    "/settings",
    "/board",
    "/board/12",
    "/auth/login",
    "/api/mcp/mcp",
  ])("공개 지면 %s 은 열려 있다", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  // 추출 과정에서 전부 열어버려도 위 테스트만으로는 통과한다. 닫힌 쪽을 같이 못박는다.
  it.each([
    "/profile",
    "/profile/edit",
    "/profile/dues",
    "/admin",
    "/admin/members",
    "/mcp-tokens",
    "/notifications",
    "/onboarding",
    "/gatherings/3",
  ])("로그인 지면 %s 은 닫혀 있다", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });

  it("공개 경로의 하위 경로까지 덩달아 열리지 않는다", () => {
    expect(isPublicPath("/settings/secret")).toBe(false);
    expect(isPublicPath("/records/export")).toBe(false);
  });
});
