"use client";

import { usePathname } from "next/navigation";

import { BackHeader } from "@/components/back-header";

/**
 * `(info)` 레이아웃 전용 BackHeader 래퍼.
 *
 * `/mcp-tokens`는 설정 화면(`/settings`)에서만 진입 링크가 있지만, 사용자가 북마크나
 * 알림 등으로 직접 진입하면 브라우저 히스토리가 비어 있어 `BackHeader`의 기본 동작인
 * `router.back()` 폴백이 먹통이 된다(#447). 이 경로에서만 `href="/settings"`를 강제해
 * 뒤로가기가 항상 동작하도록 한다.
 *
 * 빈 히스토리 자체는 이제 `BackHeader`가 전역으로 처리한다(#450) — 다른 (info) 페이지는
 * 돌아갈 데가 있으면 뒤로 가고, 없으면 기본 지면(`/`)으로 빠진다. 그래서 여기서 경로별
 * 폴백을 따로 들 필요가 없다.
 *
 * `/mcp-tokens`만 `href`(항상 이동)로 남아 있다 — 정상 진입에서도 늘 `/settings`로 가므로
 * `fallbackHref`(직접 진입일 때만)와는 동작이 다르다. 바꾸려면 #450 논의를 따를 것.
 */

/**
 * 경로 → 헤더 제목.
 *
 * 이 레이아웃은 오래도록 **뒤로가기 화살표만 있는 빈 머리띠**였다. 눌러서 도착하는 잎사귀
 * 화면들은 그래서 "여기가 어디인지"를 본문 폼에서 유추해야 했다.
 *
 * **여기 없는 경로는 제목 없이 둔다** — 그게 안전한 폴백이다. 넣지 않는 경우가 둘이다:
 *
 * 1. **본문에 자기 제목이 이미 있는 화면.** `/join`·`/terms`·`/privacy`·`/policy`는 큰
 *    `<h1>`을, `/admin`은 `<H2>`를, `/mcp-tokens`는 `Body font-semibold` 제목을 본문 맨 위에
 *    세우고 있어서, 여기에 또 달면 같은 말이 60px 안에서 두 번 나온다.
 * 2. **어디인지 물을 일이 없는 화면.** `/settings`(더보기)가 그렇다 — 방금 누른 햄버거
 *    바로 다음 화면이고 맨 위 소셜 격자가 이미 이 방의 얼굴이라, 제목을 달면 한 줄이 그냥
 *    설명 없는 머리띠로 남는다. 코드·문서에서 이 화면을 "더보기"라 부르는 것과는 별개다.
 *
 * 새 경로를 넣기 전에 그 페이지 본문을 먼저 열어 볼 것.
 */
const TITLES: Record<string, string> = {
  "/profile/edit": "프로필 수정",
  "/profile/bank": "계좌 정보",
  "/profile/dues": "회비 내역",
  "/profile/feedback": "건의하기",
};

export function InfoBackHeader() {
  const pathname = usePathname();

  // 완전 일치만 본다 — `startsWith`면 `/profile/dues/...` 같은 하위 화면까지 부모 이름을
  // 뒤집어쓴다(관리자 하위 20여 개가 전부 "관리자"가 되는 식).
  const title = TITLES[pathname];

  if (pathname === "/mcp-tokens") {
    return <BackHeader href="/settings" />;
  }

  return <BackHeader title={title} />;
}
