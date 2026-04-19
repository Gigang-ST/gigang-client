"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { prevMonthStr, nextMonthStr } from "@/lib/dayjs";
import { Button } from "@/components/ui/button";
import { useMonthTransition } from "./month-transition";

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
  const { isPending, startTransition } = useMonthTransition();

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
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => navigate(prevMonth)}
        disabled={!hasPrev || isPending}
        className="text-muted-foreground active:bg-secondary disabled:opacity-30"
        aria-label="이전 달"
      >
        <ChevronLeft className="size-5" />
      </Button>
      <span className="min-w-[3rem] text-center text-lg font-bold">
        {isPending ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : (
          label
        )}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => navigate(nextMonth)}
        disabled={!hasNext || isPending}
        className="text-muted-foreground active:bg-secondary disabled:opacity-30"
        aria-label="다음 달"
      >
        <ChevronRight className="size-5" />
      </Button>
    </div>
  );
}
