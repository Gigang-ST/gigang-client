"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_BACK_HREF } from "@/lib/back-nav";
import { useBackNav } from "@/lib/use-back-nav";

/**
 * 뒤로가기 머리띠.
 *
 * - `href`를 주면 **항상** 그곳으로 간다(뒤로가기가 아니라 지정 이동).
 * - 안 주면 뒤로 가되, 돌아갈 데가 없으면 `fallbackHref`로 보낸다(§lib/back-nav).
 *
 * 새 화면은 `href`보다 `fallbackHref` 쪽을 먼저 고려한다 — 정상 진입에서는 사용자가 실제로
 * 왔던 곳으로 돌아가고, 직접 진입일 때만 기본 지면으로 빠지는 게 맞다.
 */
export function BackHeader({
  title,
  href,
  fallbackHref = DEFAULT_BACK_HREF,
}: {
  title?: string;
  href?: string;
  fallbackHref?: string;
}) {
  const goBack = useBackNav(fallbackHref);

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center border-b border-border bg-background px-4">
      {href ? (
        <Button variant="ghost" size="icon-sm" asChild aria-label="뒤로가기">
          <Link href={href}>
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" onClick={goBack} aria-label="뒤로가기">
          <ChevronLeft className="size-5" />
        </Button>
      )}
      {title && (
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-foreground">
          {title}
        </h1>
      )}
    </header>
  );
}
