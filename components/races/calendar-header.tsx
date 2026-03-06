"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SPORT_LEGEND } from "./sport-config";

interface CalendarHeaderProps {
  currentDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function CalendarHeader({
  currentDate,
  onPrevMonth,
  onNextMonth,
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
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
        {SPORT_LEGEND.map((legend) => (
          <span key={legend.key} className="inline-flex items-center gap-1">
            <span className={`size-1.5 rounded-full ${legend.dotClass}`} />
            <span>{legend.label}</span>
          </span>
        ))}
      </div>
    </header>
  );
}
