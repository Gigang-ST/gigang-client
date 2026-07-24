"use client";

import { useState } from "react";
import { dayjs } from "@/lib/dayjs";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/empty-state";
import { TitleBadge } from "@/components/common/title-badge";

export type RecentTitleGrant = {
  mem_id: string;
  mem_nm: string;
  ttl_nm: string;
  ttl_desc: string | null;
  desc_visibility: "always" | "others" | "held" | "never";
  badge_effect: string;
  grnt_at: string;
};

type RecentTitlesProps = {
  grants: RecentTitleGrant[];
  initialCount?: number;
  myTitleNames?: string[];
};

export function RecentTitles({ grants, initialCount = 4, myTitleNames = [] }: RecentTitlesProps) {
  const [expanded, setExpanded] = useState(false);
  const myTitleNameSet = new Set(myTitleNames);
  const visible = expanded ? grants : grants.slice(0, initialCount);
  const hasMore = grants.length > initialCount;

  if (grants.length === 0) return (
    <div className="flex min-w-0 flex-col gap-3">
      <SectionHeader label="RECENT TITLES" />
      <EmptyState variant="inline" message="최근 획득 칭호가 없습니다." />
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionHeader label="RECENT TITLES" />
        {hasMore && (
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        )}
      </div>

      <div className="flex flex-col divide-y divide-border">
        {visible.map((g, idx) => {
          const dateLabel = dayjs(g.grnt_at).tz("Asia/Seoul").format("MM/DD");
          return (
            <div key={`${g.mem_id}-${g.ttl_nm}-${idx}`} className="flex min-h-9 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{g.mem_nm}</span>
              <TitleBadge
                name={g.ttl_nm}
                effect={g.badge_effect}
                size="xs"
                tooltip={{
                  desc: g.ttl_desc,
                  visibility: g.desc_visibility,
                  isHeld: myTitleNameSet.has(g.ttl_nm),
                }}
              />
              <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">{dateLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
