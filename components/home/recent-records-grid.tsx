"use client";

import { useState } from "react";
import { secondsToTime } from "@/lib/dayjs";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";
import { TitleBadge } from "@/components/common/title-badge";
import { Body, Caption, Micro } from "@/components/common/typography";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

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
  /** 처음 표시할 개수 (기본 4) */
  initialCount?: number;
};

export function RecentRecordsGrid({
  records,
  titleMap,
  initialCount = 4,
}: RecentRecordsGridProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleRecords = expanded ? records : records.slice(0, initialCount);
  const hasMore = records.length > initialCount;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader label="RECENT RECORDS" />

      {records.length === 0 ? (
        <EmptyState variant="card" message="등록된 기록이 없습니다." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {visibleRecords.map((rec, idx) => {
              const title = rec.mem_id ? titleMap[rec.mem_id] : undefined;
              const frameCls = getFrameCls(title?.frame_cd);
              return (
                <div
                  key={`${rec.mem_id ?? "unknown"}-${rec.race_nm ?? idx}`}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-border bg-card p-3",
                    frameCls,
                  )}
                >
                  {/* 이름 + 칭호 */}
                  <div className="flex items-center gap-1 overflow-hidden">
                    <Body className="shrink-0 font-semibold leading-none">
                      {rec.mem_nm ?? "멤버"}
                    </Body>
                    {title && (
                      <TitleBadge
                        name={title.ttl_nm}
                        effect={title.badge_effect}
                        size="xs"
                        tooltip={{
                          desc: title.ttl_desc,
                          visibility: title.desc_visibility,
                          isHeld: true,
                          isOwner: false,
                        }}
                      />
                    )}
                  </div>

                  {/* 기록 시간 */}
                  <span className="font-mono text-base font-bold leading-none text-foreground">
                    {secondsToTime(rec.rec_time_sec ?? 0)}
                  </span>

                  {/* 종목 · 대회명 */}
                  <Caption className="truncate leading-tight">
                    {(rec.evt_cd ?? "UNKNOWN").toUpperCase()} · {rec.race_nm}
                  </Caption>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? "접기" : `더 보기 (${records.length - initialCount}개)`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
