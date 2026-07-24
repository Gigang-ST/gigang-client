"use client";

import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * 물음표 도움말 — 기능 옆에 붙어 "이게 뭔가"를 그 자리에서 답한다.
 *
 * 게임 UI의 물음표 버튼과 같은 역할이다. 사용법을 매뉴얼에만 두면 아무도 안 읽으므로,
 * 설명이 필요한 지표·규칙 옆에 이걸 붙인다. **앱 전역 공통 패턴** — 새 기능에 설명이
 * 필요하면 별도 툴팁을 만들지 말고 이 컴포넌트를 쓴다.
 *
 * 아이콘은 작지만(14px) 히트 영역은 32px다 — 손가락으로 눌러야 하므로.
 */
export function HelpTip({
  title,
  children,
  align = "end",
  className,
}: {
  /** 무엇에 대한 설명인지. 팝오버 제목이자 스크린리더 라벨의 재료 */
  title: string;
  /** 설명 본문. 두세 줄로 끝낸다 — 길어지면 문서로 보낼 것 */
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${title} 설명`}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-4">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
