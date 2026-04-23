"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Segment<T extends string = string> = {
  value: T;
  label: string;
};

type SegmentControlProps<T extends string = string> = {
  /** 탭 목록 */
  segments: Segment<T>[];
  /** 현재 선택된 값 */
  value: T;
  /** 값 변경 핸들러 */
  onValueChange: (value: T) => void;
  className?: string;
};

/** 탭 전환 세그먼트 컨트롤 */
function SegmentControl<T extends string = string>({
  className,
  segments,
  value,
  onValueChange,
}: SegmentControlProps<T>) {
  return (
    <div className={cn("flex gap-0 rounded-xl border border-border bg-secondary p-1", className)}>
      {segments.map((seg, idx) => (
        <button
          key={seg.value}
          type="button"
          aria-pressed={value === seg.value}
          onClick={() => onValueChange(seg.value)}
          className={cn(
            "relative flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors",
            value === seg.value
              ? "bg-background text-foreground shadow-sm dark:bg-card dark:shadow-none"
              : "text-muted-foreground",
          )}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}

export { SegmentControl };
export type { Segment, SegmentControlProps };
