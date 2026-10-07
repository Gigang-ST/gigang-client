"use client";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 게임팀 색 → 배경 클래스. **리터럴 문자열 맵**이어야 한다 — `bg-chart-${n}`처럼 조립하면
 * Tailwind 스캐너가 클래스를 못 찾아 빌드에서 빠진다. null(색 미지정)은 중립 회색.
 * 번호 1~5는 서버가 저장하는 `colorNo` 그대로이고, 색을 늘리면 `PB_GROUP_COLOR_NOS`도 함께 늘린다.
 */
const GROUP_COLOR_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

export const PB_GROUP_COLOR_NOS = [1, 2, 3, 4, 5] as const;

export function groupColorClass(colorNo: number | null | undefined): string {
  return (colorNo != null && GROUP_COLOR_CLASS[colorNo]) || "bg-muted";
}

/** 팀 색 점 — 이름 옆에 붙이는 12px 원 */
export function GroupDot({ colorNo, className }: { colorNo: number | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 rounded-full", groupColorClass(colorNo), className)}
    />
  );
}

/** 탭 첫 조회 로딩 — 세 탭 공통 */
export function PbGameSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full rounded-xl" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** 탭 첫 조회 실패 — 다시 불러오기 */
export function PbGameLoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <EmptyState variant="card" message={message ?? "불러오지 못했어요"} className="w-full" />
      <Button variant="outline" className="h-11 rounded-xl" onClick={onRetry}>
        다시 불러오기
      </Button>
    </div>
  );
}
