"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

  const [y, m] = currentMonth.split("-").map(Number);
  const label = `${m}월`;

  const prevMonth = (() => {
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  const nextMonthStr = (() => {
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  // 시작월 1달 전(연습 기간)부터 탐색 가능
  const practiceMonth = (() => {
    const [sy, sm] = startMonth.split("-").map(Number);
    const d = new Date(sy, sm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  const hasPrev = prevMonth >= practiceMonth;
  const hasNext = nextMonthStr <= endMonth;

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
        onClick={() => navigate(nextMonthStr)}
        disabled={!hasNext}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-secondary disabled:opacity-30"
        aria-label="다음 달"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
