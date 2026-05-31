"use client";

import { useState } from "react";
import { secondsToTime } from "@/lib/dayjs";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";
import { TitleBadge } from "@/components/common/title-badge";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/empty-state";

export type RecentRecord = {
  mem_id: string | null;
  mem_nm: string | null;
  race_nm: string | null;
  evt_cd: string | null;
  rec_time_sec: number | null;
};

export type RecordTitleInfo = {
  ttl_nm: string;
  ttl_desc: string | null;
  desc_visibility: "always" | "others" | "held" | "never";
  badge_effect: string;
  frame_cd: string;
};

type RecentRecordsGridProps = {
  records: RecentRecord[];
  titleMap: Record<string, RecordTitleInfo>;
  myTitleNames?: string[];
  /** 처음 표시할 개수 (기본 4) */
  initialCount?: number;
};

export function RecentRecordsGrid({
  records,
  titleMap,
  myTitleNames = [],
  initialCount = 4,
}: RecentRecordsGridProps) {
  const myTitleNameSet = new Set(myTitleNames);
  const [expanded, setExpanded] = useState(false);

  const visibleRecords = expanded ? records : records.slice(0, initialCount);
  const hasMore = records.length > initialCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionHeader label="RECENT RECORDS" />
        {hasMore && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <EmptyState variant="card" message="등록된 기록이 없습니다." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visibleRecords.map((rec, idx) => {
              const title = rec.mem_id ? titleMap[rec.mem_id] : undefined;
              const frameCls = getFrameCls(title?.frame_cd);
              return (
                <div
                  key={`${rec.mem_id ?? "unknown"}-${rec.race_nm ?? idx}`}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-xl border border-border bg-card p-2",
                    frameCls,
                  )}
                >
                  {/* 줄 1: 이름 + 칭호 */}
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-[12px] font-semibold text-foreground">
                      {rec.mem_nm ?? "멤버"}
                    </span>
                    {title && (
                      <TitleBadge
                        name={title.ttl_nm}
                        effect={title.badge_effect}
                        size="xs"
                        tooltip={{
                          desc: title.ttl_desc,
                          visibility: title.desc_visibility,
                          isHeld: myTitleNameSet.has(title.ttl_nm),
                          isOwner: false,
                        }}
                      />
                    )}
                  </div>
                  {/* 줄 2: 대회명 + 기록 */}
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                      {rec.race_nm ?? "-"}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-foreground">
                      {secondsToTime(rec.rec_time_sec ?? 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
      )}
    </div>
  );
}
