"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SPORT_LEGEND } from "./sport-config";

interface CalendarHeaderProps {
  currentDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

export function CalendarHeader({
  currentDate,
  onPrevMonth,
  onNextMonth,
  onToday,
}: CalendarHeaderProps) {
  const monthYear = currentDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground lg:text-xl">
          {monthYear}
        </h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrevMonth}
            aria-label="이전 달"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNextMonth}
            aria-label="다음 달"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToday}
          className="text-white/90 hover:text-white hover:bg-white/15"
        >
          오늘
        </Button>
      </div>

      <div className="flex flex-col items-end gap-2 text-xs text-white">
        <span className="font-semibold text-white">색상 구분</span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-white/90 sm:grid-cols-3">
          {SPORT_LEGEND.map((legend) => (
            <span key={legend.key} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${legend.dotClass}`} />
              <span>{legend.label}</span>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
