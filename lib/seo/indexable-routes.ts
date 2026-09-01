/**
 * 검색엔진에 색인시킬 공개 경로.
 *
 * `lib/supabase/public-paths.ts`의 PUBLIC_PATHS와 목적이 다르다 — 저쪽은 "비로그인이
 * 열 수 있나", 이쪽은 "검색결과에 띄울 값어치가 있나"다. 약관·정책처럼 열려 있지만
 * 검색으로 찾아올 이유가 없는 지면은 여기서 뺀다. 둘을 한 목록으로 합치지 마라.
 *
 * `/story`가 빠진 것은 실수가 아니다 — `app/(main)/page.tsx`의 `HOME_PAGE`가 "story"라
 * `/`와 `/story`가 **같은 화면**이다. 둘 다 올리면 중복 문서가 되어 색인에서 불리하다.
 * (`/story`는 canonical로 `/`를 가리킨다.) HOME_PAGE를 "schedule"로 바꾸면 여기서도
 * `/schedule`을 빼고 `/story`를 넣어야 한다.
 */
export type IndexableRoute = {
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
};

export const INDEXABLE_ROUTES: IndexableRoute[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  // 신입 안내·가입 — 검색으로 크루를 찾아온 사람이 실제로 닿아야 하는 두 지면.
  { path: "/newbie", changeFrequency: "monthly", priority: 0.9 },
  { path: "/join", changeFrequency: "monthly", priority: 0.9 },
  { path: "/schedule", changeFrequency: "daily", priority: 0.8 },
  { path: "/records", changeFrequency: "weekly", priority: 0.7 },
  { path: "/races", changeFrequency: "weekly", priority: 0.6 },
  { path: "/rules", changeFrequency: "yearly", priority: 0.5 },
  { path: "/board", changeFrequency: "weekly", priority: 0.5 },
];

/**
 * 색인에서 빼는 경로 접두사.
 *
 * 로그인이 필요한 지면(미들웨어가 /auth/login으로 302)과 크롤 값어치가 없는 지면이다.
 * 302되는 경로를 크롤러가 반복해 두드리면 크롤 예산만 태우고 로그인 화면이 중복
 * 문서로 쌓인다.
 */
export const DISALLOWED_PREFIXES = [
  "/api/",
  "/auth/",
  "/admin",
  "/profile",
  "/onboarding",
  "/notifications",
  "/mcp-tokens",
  "/gatherings/",
  "/settings",
  // 비로그인이면 /auth/login 으로 튕긴다 — 크롤러가 볼 내용이 없다.
  "/projects",
  "/board/write",
  "/terms",
  "/privacy",
  "/policy",
];
