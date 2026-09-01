/**
 * 비로그인 상태에서도 접근 가능한 공개 경로 판정.
 *
 * proxy(미들웨어)에서 쓰지만 별도 모듈로 둔다 — `proxy.ts`는 `@/lib/env`와
 * `@supabase/ssr`을 끌고 오는데, 이 판정은 순수 문자열 비교라 그 무게 없이
 * 테스트되어야 한다. 회귀 테스트는 `lib/__tests__/public-paths.test.ts`.
 */

/** 완전 일치로 공개되는 경로. prefix 매칭이면 하위 경로까지 덩달아 열린다. */
const PUBLIC_PATHS = [
  "/",
  "/rules",
  "/join",
  "/newbie",
  "/races",
  "/records",
  "/schedule",
  "/story",
  "/projects",
  "/terms",
  "/privacy",
  "/policy",
  "/settings",
  // public/llms.txt — LLM·에이전트용 사이트 안내문(llms.txt 규약).
  // proxy matcher가 `.txt`를 제외하지 않아 정적 파일인데도 미들웨어를 탄다.
  // 여기서 빠지면 쿠키 없는 요청이 로그인으로 302되어 파일이 조용히 죽는다.
  "/llms.txt",
  // 검색엔진용 두 파일(app/robots.ts · app/sitemap.ts가 생성).
  // llms.txt와 똑같은 이유로 여기 있어야 한다 — matcher가 `.txt`/`.xml`을 제외하지
  // 않으므로, 빠지면 크롤러(쿠키 없음)가 로그인 화면으로 302된다. 크롤러는 그걸
  // 에러로 보고하지 않고 그냥 색인을 안 할 뿐이라 고장이 눈에 안 띈다.
  "/robots.txt",
  "/sitemap.xml",
];

/**
 * 해당 경로가 비로그인 접근을 허용하는지 판정한다.
 *
 * - `/`(홈)·`/story`(전광판)·`/schedule`(달력)은 모두 팀 공개 지면이라 비로그인 허용.
 *   홈이 어느 쪽을 그리든(`app/(main)/page.tsx`의 HOME_PAGE) 셋 다 열려 있어야 한다.
 * - `/board`(게시판)은 공개 SSG 페이지 — 목록·상세 모두 비로그인 접근 허용.
 *   (쓰기/수정 전용 하위 경로 `/board/write`·`/board/[id]/edit`는 admin 폼이라 여기서
 *    함께 열리지만, 실제 인가는 페이지의 getCurrentMember 게이트와 서버 액션
 *    (withAdminOrThrow)이 재검증하므로 안전하다.)
 * - `/api/*`는 각 라우트가 자체 인증(멤버 체크·웹훅 시크릿)을 수행하므로 리다이렉트 제외.
 *   쿠키 없는 서버-투-서버 요청(revalidate 웹훅, OG 봇, 크론)을 로그인으로 보내면 안 된다.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname === "/board" ||
    pathname.startsWith("/board/") ||
    pathname.startsWith("/auth") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}
