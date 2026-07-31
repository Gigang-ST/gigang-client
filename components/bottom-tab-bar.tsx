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

/**
 * 홈(`/`)에 무엇을 그릴지는 `app/(main)/page.tsx`의 `HOME_PAGE`가 정한다.
 * 지금은 전광판이라 **가운데 로고 탭이 `/`를 가리킨다**(일정 탭은 `/schedule`).
 *
 * `HOME_PAGE`를 바꾸면 여기도 같이 바꿔야 한다 — 홈이 달력이 되면 일정 탭이 `/`,
 * 로고 탭이 `/story`를 가리켜야 한다. 안 그러면 탭 둘이 같은 화면을 열어 하나가 죽는다.
 */
const TABS = [
  { label: "랭킹", href: "/records", key: "records", icon: Medal as TabIcon, hideLabel: false },
  { label: "일정", href: "/schedule", key: "schedule", icon: CalendarDays as TabIcon, hideLabel: false },
  { label: "기강", href: "/", key: "story", icon: StoryLogoIcon as TabIcon, hideLabel: true },
  { label: "프로젝트", href: "/projects", key: "projects", icon: Zap as TabIcon, hideLabel: false },
  { label: "프로필", href: "/profile", key: "profile", icon: User as TabIcon, hideLabel: false },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="app-fixed fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)]">
      {/* 탭 5개를 정확히 1/5씩 나눈다(flex-1 basis-0) — justify-around는 라벨
          글자수만큼 탭 폭이 달라져 아이콘이 각 칸의 중앙에서 밀린다.
          items-stretch로 각 탭이 바 높이를 그대로 받아 세로 가운데에 앉는다. */}
      <div className="flex h-14 items-stretch">
        {TABS.map((tab) => {
          // 홈(`/`)만 정확히 일치로 본다 — startsWith면 모든 경로가 홈에 걸린다.
          // 다만 `/story`는 홈과 **같은 화면**이라(app/(main)/page.tsx의 HOME_PAGE)
          // 별칭으로 함께 켠다 — 안 그러면 /story 직접 진입 시 다섯 탭이 모두 꺼진다.
          // HOME_PAGE를 "schedule"로 바꾸면 이 별칭도 "/schedule"로 함께 뒤집어야 한다.
          const isActive =
            tab.href === "/"
              ? pathname === "/" || pathname === "/story"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              onClick={() => analytics.tabClick(tab.key)}
              className={cn(
                // 구역부터 정확히 1/5로 나눈다 — 아이콘·글자 크기와 무관하게.
                //   flex-1 basis-0 : 남는 폭을 다섯이 똑같이 나눠 가진다(시작 폭 0에서 출발).
                //   min-w-0        : 이게 없으면 라벨이 길어질 때 내용 최소폭이 칸을 밀어
                //                    넓혀 그 탭만 넓어진다(flex 기본 min-width:auto).
                // 그래서 각 칸은 항상 같은 폭이고, 아이콘은 그 칸의 가로 중앙에 온다.
                "flex min-w-0 flex-1 basis-0 flex-col items-center justify-center",
                // 라벨 없는 로고 탭은 상하 여백 없이 바 높이를 꽉 채운다.
                // 라벨 있는 탭만 아이콘~라벨 간격(gap-1)을 가진다.
                tab.hideLabel ? "py-0" : "gap-1",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {/* 상하 여백을 로고와 맞춘다 — 바 h-14(56px) 기준:
                  로고 탭  = 44px(size-11)          → 위아래 6px
                  일반 탭  = 24px + 4px + 16px = 44px → 위아래 6px (아이콘+gap+라벨)
                  라벨은 leading-4로 줄높이를 고정해야 이 계산이 실제와 어긋나지 않는다. */}
              <Icon className={cn(tab.hideLabel ? "size-11" : "size-6")} />
              {!tab.hideLabel && (
                // 한 줄 고정 — 라벨이 길어져도 줄바꿈으로 탭 높이가 늘지 않는다(위 44px 계산 유지).
                <span className="max-w-full truncate text-[10px] font-medium leading-4">
                  {tab.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
