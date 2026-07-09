"use client";

import { useRef, useState } from "react";

import { House, Medal, Newspaper, User, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

import { Body, Caption, SectionLabel } from "@/components/common/typography";

/**
 * 가입 완료 화면에서 앱의 5개 하단 탭을 소개하는 가로 스와이프 캐러셀.
 * 세로 스크롤을 만들지 않도록 카드 1장 높이만 차지하고, 옆으로 넘겨 탭을 하나씩 본다.
 * 아이콘·이름은 실제 탭바(components/bottom-tab-bar.tsx)와 일치시킨다.
 * 뉴비가 "모임을 여기서 본다"는 걸 모를 수 있어, 첫 카드(홈)에서 그 점을 짚어준다.
 */
const TAB_GUIDE = [
  {
    icon: House,
    name: "홈",
    desc: "이번 주 모임·일정·공지를 여기서 확인하고 참석 신청해요",
  },
  {
    icon: Newspaper,
    name: "기강이야기",
    desc: "크루 소식과 활동 이야기를 만나요",
  },
  {
    icon: Zap,
    name: "프로젝트",
    desc: "함께하는 챌린지와 목표 활동에 참여해요",
  },
  {
    icon: Medal,
    name: "랭킹",
    desc: "대회 기록과 크루 순위를 확인해요",
  },
  {
    icon: User,
    name: "프로필",
    desc: "내 기록·회비·설정을 관리해요",
  },
] as const;

export function AppTabsGuide() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  // 스크롤 위치로 현재 보이는 카드 인덱스를 계산(도트 인디케이터용).
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx);
  };

  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <SectionLabel>기강 앱 둘러보기</SectionLabel>
        <Caption className="text-[11px]">옆으로 넘겨보세요 →</Caption>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TAB_GUIDE.map((tab) => {
          const Icon = tab.icon;
          return (
            <div
              key={tab.name}
              className="flex w-full shrink-0 snap-center items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-primary">
                <Icon className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col">
                <Body className="font-semibold">{tab.name}</Body>
                <Caption>{tab.desc}</Caption>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {TAB_GUIDE.map((tab, i) => (
          <span
            key={tab.name}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              i === active ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}
