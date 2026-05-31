"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/common/section-header";
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

  if (grants.length === 0) return null;

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
          const date = new Date(g.grnt_at);
          const mm = String(date.getMonth() + 1).padStart(2, "0");
          const dd = String(date.getDate()).padStart(2, "0");
          return (
            <div key={`${g.mem_id}-${g.ttl_nm}-${idx}`} className="flex min-h-9 items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 truncate text-[12px] font-medium text-foreground">{g.mem_nm}</span>
                <TitleBadge
                  name={g.ttl_nm}
                  effect={g.badge_effect}
                  size="xs"
                  tooltip={{
                    desc: g.ttl_desc,
                    visibility: g.desc_visibility,
                    isHeld: myTitleNameSet.has(g.ttl_nm),
                    isOwner: false,
                  }}
                />
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{mm}/{dd}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
