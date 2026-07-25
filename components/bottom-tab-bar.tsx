"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Medal, User, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { analytics } from "@/lib/analytics";

/**
 * 기강 탭 아이콘 — 메인 로고(원형 엠블럼)를 CSS mask로 박는다.
 * 로고를 실루엣 마스크로 써서 `bg-current`로 물들여야 다른 탭처럼 활성(파랑)/
 * 비활성(회색) 색 전환이 먹는다 — 색 있는 로고 이미지를 그대로 쓰면 항상 검정이라
 * 톤이 따로 논다. 마스크 소스는 로고 전체(테두리 영문 포함) 실루엣(`public/logo-mark.png`).
 * 로고 안에 이미 "기강" 글자가 있으므로 이 탭만 아래 텍스트 라벨을 뺀다(`hideLabel`).
 */
function StoryLogoIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block bg-current", className)}
      style={{
        maskImage: "url(/logo-mark.png)",
        WebkitMaskImage: "url(/logo-mark.png)",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
      aria-hidden
    />
  );
}

// 아이콘은 lucide 컴포넌트 또는 로고 이미지 컴포넌트 둘 다 받는다.
type TabIcon = LucideIcon | typeof StoryLogoIcon;

const TABS = [
  { label: "랭킹", href: "/records", key: "records", icon: Medal as TabIcon, hideLabel: false },
  { label: "일정", href: "/", key: "home", icon: CalendarDays as TabIcon, hideLabel: false },
  { label: "기강", href: "/story", key: "story", icon: StoryLogoIcon as TabIcon, hideLabel: true },
  { label: "프로젝트", href: "/projects", key: "projects", icon: Zap as TabIcon, hideLabel: false },
  { label: "프로필", href: "/profile", key: "profile", icon: User as TabIcon, hideLabel: false },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex h-14 items-center justify-around">
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              onClick={() => analytics.tabClick(tab.key)}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {/* 로고 탭은 라벨을 빼는 대신 아이콘을 조금 키워(size-7) 다른 탭과
                  광학적 높이를 맞춘다 — 원형 로고는 여백이 있어 같은 size-5면 작아 보인다. */}
              <Icon className={cn(tab.hideLabel ? "size-7" : "size-5")} />
              {!tab.hideLabel && (
                <span className="text-[10px] font-medium">{tab.label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
