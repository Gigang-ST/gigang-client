"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/empty-state";

export type RecentJoiner = {
  mem_id: string;
  mem_nm: string;
  join_dt: string; // "YYYY-MM-DD"
};

type RecentJoinersProps = {
  joiners: RecentJoiner[];
  initialCount?: number;
};

export function RecentJoiners({ joiners, initialCount = 4 }: RecentJoinersProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? joiners : joiners.slice(0, initialCount);
  const hasMore = joiners.length > initialCount;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionHeader label="NEW MEMBERS" />
        {hasMore && (
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        )}
      </div>

      {joiners.length === 0 ? (
        <EmptyState variant="inline" message="최근 가입자가 없습니다." />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {visible.map((j) => {
            const [, mm, dd] = j.join_dt.split("-");
            return (
              <div key={j.mem_id} className="flex min-h-9 items-center justify-between gap-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="text-[11px]">🎉</span>
                  <span className="truncate text-[12px] font-medium text-foreground">{j.mem_nm}</span>
                  <span className="shrink-0 rounded px-1 py-px text-[9px] font-bold tracking-wide bg-primary/15 text-primary">
                    NEW
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {mm}/{dd}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
