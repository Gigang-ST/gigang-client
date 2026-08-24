"use client";

import { usePathname } from "next/navigation";

import { BackHeader } from "@/components/back-header";
import { DEFAULT_BACK_HREF } from "@/lib/back-nav";

/**
 * `(info)` 레이아웃 전용 BackHeader 래퍼. 경로에 따라 **제목**과 **폴백**을 정해 넘긴다.
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

/**
 * 경로 → **돌아갈 데가 없을 때만** 갈 곳.
 *
 * `href`가 아니라 `fallbackHref`인 것이 핵심이다. `/mcp-tokens`는 한때 `href="/settings"`를
 * 강제해 빈 히스토리를 우회했는데(#447), 그건 `BackHeader`에 폴백이 없던 시절의 임시
 * 처방이었다. `href`는 히스토리와 무관하게 **늘** 그리로 보내므로, 설정에서 정상 진입한
 * 사람의 뒤로가기까지 "뒤로"가 아니게 된다. 폴백이 전역으로 생긴 지금은 목적지만 남기고
 * "항상"을 걷어낸다(#450).
 *
 * **경로별 부모 맵을 전부 채우지 않는다.** `(info)` 라우트가 40개인데 대부분은 기본값(`/`)
 * 으로 충분하고, 목록을 통째로 들고 있으면 라우트가 늘 때마다 여기도 같이 고쳐야 하는 짐이
 * 된다. 기본값이 어색한 화면만 여기 적는다.
 */
const FALLBACKS: Record<string, string> = {
  // 앱 안에서 이리로 오는 링크가 설정 한 곳뿐이라, 정상 진입이면 어차피 여기로 돌아간다.
  // 이 줄이 사는 자리는 북마크·딥링크로 곧장 들어온 경우다.
  "/mcp-tokens": "/settings",
};

export function InfoBackHeader() {
  const pathname = usePathname();

  // 완전 일치만 본다 — `startsWith`면 `/profile/dues/...` 같은 하위 화면까지 부모 이름을
  // 뒤집어쓴다(관리자 하위 20여 개가 전부 "관리자"가 되는 식).
  const title = TITLES[pathname];
  const fallbackHref = FALLBACKS[pathname] ?? DEFAULT_BACK_HREF;

  return <BackHeader title={title} fallbackHref={fallbackHref} />;
}
