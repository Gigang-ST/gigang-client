import { Fragment } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * 약관 세 링크 한 줄 — 홈 푸터(`StoryLegalFooter`)와 더보기 푸터가 **같은 것**을 쓴다. 따로 두면 문서가 하나 늘 때 한쪽만 고쳐진다.
 *
 * - 개인정보 처리방침만 굵게 — 국내 서비스 푸터의 관례(다른 고지와 구분해 눈에 띄게).
 * - `py-2`로 세로 히트 영역을 벌린다 — 12px 글자를 손가락으로 겨냥해야 하니 글자 크기만 믿고 눕히면 누르기 어려운 링크가 된다.
 * - 구분점은 장식이라 aria에서 뺀다.
 */
export const LEGAL_LINKS = [
  { label: "이용약관", href: "/terms" },
  { label: "개인정보 처리방침", href: "/privacy", strong: true },
  { label: "운영 정책", href: "/policy" },
] as const;

export function LegalLinks({ align = "start", className }: { align?: "start" | "center"; className?: string }) {
  return (
    <nav
      aria-label="약관"
      className={cn("flex flex-wrap items-center gap-x-2", align === "center" && "justify-center", className)}
    >
      {LEGAL_LINKS.map((item, i) => (
        <Fragment key={item.href}>
          {i > 0 && (
            <span aria-hidden className="text-xs text-border">
              ·
            </span>
          )}
          <Link
            href={item.href}
            className={cn(
              // 밑줄은 늘 — 누르는 것이라는 표시(글자만 있으면 그냥 문구로 읽힌다)
              "py-2 text-xs underline underline-offset-2",
              "strong" in item ? "font-semibold text-foreground/80" : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}
