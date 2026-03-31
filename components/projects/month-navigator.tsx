"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prevMonthStr, nextMonthStr } from "@/lib/dayjs";

export function MonthNavigator({
  currentMonth,
  startMonth,
  endMonth,
}: {
  currentMonth: string; // "2026-05-01"
  startMonth: string;
  endMonth: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const displayMonth = Number(currentMonth.split("-")[1]);
  const label = `${displayMonth}월`;

  const prevMonth = prevMonthStr(currentMonth);
  const nextMonth = nextMonthStr(currentMonth);
  const practiceMonth = prevMonthStr(startMonth);

  const hasPrev = prevMonth >= practiceMonth;
  const hasNext = nextMonth <= endMonth;

  function navigate(month: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <button
        onClick={() => navigate(prevMonth)}
        disabled={!hasPrev}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-secondary disabled:opacity-30"
        aria-label="이전 달"
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="min-w-[3rem] text-center text-lg font-bold">
        {label}
      </span>
      <button
        onClick={() => navigate(nextMonth)}
        disabled={!hasNext}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-secondary disabled:opacity-30"
        aria-label="다음 달"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
