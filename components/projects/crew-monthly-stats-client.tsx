"use client";

import { useChartMode } from "./chart-mode-context";

export function CrewMonthlyStatsClient({
  displayMonth,
  isPractice,
  activeMemberCount,
  avgRate,
  avgMileage,
  achievedCount,
  totalRefunds,
  partyPool,
}: {
  displayMonth: number;
  isPractice: boolean;
  activeMemberCount: number;
  avgRate: number;
  avgMileage: number;
  achievedCount: number;
  totalRefunds: number;
  partyPool: number;
}) {
  const { mode } = useChartMode();

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">
        {displayMonth}월 진행현황
        {isPractice && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            (연습)
          </span>
        )}
      </h2>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">참여 인원</p>
          <p className="text-xl font-bold">{activeMemberCount}명</p>
        </div>
        <div>
          <p className="text-muted-foreground">
            {mode === "mileage" ? "평균 마일리지" : "평균 달성률"}
          </p>
          <p className="text-xl font-bold">
            {mode === "mileage"
              ? `${avgMileage.toFixed(1)} km`
              : `${avgRate.toFixed(1)}%`}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">달성 인원</p>
          <p className="text-xl font-bold">
            {achievedCount} / {activeMemberCount}명
          </p>
        </div>
        {!isPractice && (
          <div>
            <p className="text-muted-foreground">환급 예상 총액</p>
            <p className="text-xl font-bold">
              {Math.floor(totalRefunds).toLocaleString()}원
            </p>
          </div>
        )}
      </div>

      {!isPractice && (
        <div className="border-t pt-3">
          <p className="text-muted-foreground text-sm">회식비 풀</p>
          <p className="text-xl font-bold">
            {Math.floor(partyPool).toLocaleString()}원
          </p>
        </div>
      )}
    </section>
  );
}
