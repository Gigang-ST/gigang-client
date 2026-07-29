"use client";

import { usePathname } from "next/navigation";

import { BackHeader } from "@/components/back-header";

/**
 * `(info)` 레이아웃 전용 BackHeader 래퍼.
 *
 * `/mcp-tokens`는 설정 화면(`/settings`)에서만 진입 링크가 있지만, 사용자가 북마크나
 * 알림 등으로 직접 진입하면 브라우저 히스토리가 비어 있어 `BackHeader`의 기본 동작인
 * `router.back()` 폴백이 먹통이 된다(#447). 이 경로에서만 `href="/settings"`를 강제해
 * 뒤로가기가 항상 동작하도록 한다. 다른 (info) 페이지는 기존 `router.back()` 동작 유지.
 *
 * ⚠️ BackHeader의 빈-히스토리 폴백을 전역적으로 고치는 근본수정은 별도 이슈(#450) 범위다.
 * 여기서는 mcp-tokens 경로 하나만 스코프로 좁혀 처리한다.
 */
export function InfoBackHeader() {
  const pathname = usePathname();

  if (pathname === "/mcp-tokens") {
    return <BackHeader href="/settings" />;
  }

  return <BackHeader />;
}
