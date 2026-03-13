"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  타입 정의                                                          */
/* ------------------------------------------------------------------ */

type RankingEntry = {
  rank: number;
  name: string;
  record: string;
  raceName: string | null;
};

type MarathonEvent = {
  eventType: string;
  label: string;
  male: RankingEntry[];
  female: RankingEntry[];
};

type TrailEntry = {
  rank: number;
  name: string;
  utmbIndex: number;
  recentRaceName: string | null;
  recentRaceRecord: string | null;
  utmbProfileUrl: string | null;
};

type TriathlonEntry = {
  rank: number;
  name: string;
  record: string;
  raceName: string | null;
  isMain: boolean;
};

type TriathlonEvent = {
  eventType: string;
  label: string;
  entries: TriathlonEntry[];
};

type RecordsData = {
  marathon: { events: MarathonEvent[] };
  trail: { entries: TrailEntry[] };
  triathlon: { events: TriathlonEvent[] };
};

/* ------------------------------------------------------------------ */
/*  카테고리 탭 정의                                                    */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { key: "marathon", label: "마라톤" },
  { key: "trail", label: "트레일러닝" },
  { key: "triathlon", label: "철인3종" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

/* ------------------------------------------------------------------ */
/*  MedalBadge                                                        */
/* ------------------------------------------------------------------ */

function MedalBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = {
    1: "bg-gradient-to-b from-[#FFD700] to-[#FFA500]",
    2: "bg-gradient-to-b from-[#D1D5DB] to-[#9CA3AF]",
    3: "bg-gradient-to-b from-[#D97706] to-[#B45309]",
  };
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        colors[rank],
      )}
    >
      <span className="text-sm font-extrabold text-white">{rank}</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return <MedalBadge rank={rank} />;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center text-xl font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  빈 상태                                                            */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      아직 등록된 기록이 없습니다.
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  마라톤 셀 (남자/여자 각 칸)                                          */
/* ------------------------------------------------------------------ */

function MarathonCell({ entry }: { entry?: RankingEntry }) {
  if (!entry) {
    return <div className="flex-1 py-1 text-center text-xs text-muted-foreground">-</div>;
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[13px] font-semibold text-foreground">
          {entry.name}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-xs font-bold",
            entry.rank === 1 ? "text-primary" : "text-foreground",
          )}
        >
          {entry.record}
        </span>
      </div>
      <span className="truncate text-[11px] text-muted-foreground">
        {entry.raceName ?? "-"}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  마라톤 탭 콘텐츠                                                    */
/* ------------------------------------------------------------------ */

function MarathonContent({ events }: { events: MarathonEvent[] }) {
  const [selectedEvent, setSelectedEvent] = useState(
    events[0]?.eventType ?? "",
  );

  const currentEvent = events.find((e) => e.eventType === selectedEvent);
  const maxRows = Math.max(
    currentEvent?.male.length ?? 0,
    currentEvent?.female.length ?? 0,
  );

  return (
    <>
      {/* 종목 서브탭 */}
      {events.length > 1 && (
        <div className="flex gap-2 px-6">
          {events.map((evt) => (
            <button
              key={evt.eventType}
              type="button"
              onClick={() => setSelectedEvent(evt.eventType)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                selectedEvent === evt.eventType
                  ? "bg-muted-foreground/20 text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {evt.label}
            </button>
          ))}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center gap-3 px-6 pt-2">
        <div className="w-8 shrink-0" />
        <span className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground">
          남자
        </span>
        <span className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground">
          여자
        </span>
      </div>

      {/* 랭킹 리스트: 등수 | 남자 | 여자 */}
      <div className="flex flex-col px-6">
        {maxRows === 0 ? (
          <EmptyState />
        ) : (
          Array.from({ length: maxRows }).map((_, i) => {
            const rank = i + 1;
            const male = currentEvent?.male[i];
            const female = currentEvent?.female[i];
            return (
              <div
                key={rank}
                className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
              >
                <RankBadge rank={rank} />
                <MarathonCell entry={male} />
                <MarathonCell entry={female} />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  트레일러닝 탭 콘텐츠                                                */
/* ------------------------------------------------------------------ */

function TrailContent({ entries }: { entries: TrailEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="px-6">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col px-6 pt-2">
      {entries.map((entry) => (
        <div
          key={`t-${entry.rank}-${entry.name}`}
          className="flex items-center gap-4 border-b border-border py-4 last:border-b-0"
        >
          <RankBadge rank={entry.rank} />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {entry.utmbProfileUrl ? (
              <a
                href={entry.utmbProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] font-semibold text-primary hover:underline"
              >
                {entry.name}
              </a>
            ) : (
              <span className="text-[15px] font-semibold text-foreground">
                {entry.name}
              </span>
            )}
            <span className="truncate text-xs text-muted-foreground">
              {entry.recentRaceName ?? "-"}
            </span>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span
              className={cn(
                "font-mono text-lg font-bold",
                entry.rank === 1 ? "text-primary" : "text-foreground",
              )}
            >
              {entry.utmbIndex}
            </span>
            <span className="text-xs text-muted-foreground">
              {entry.recentRaceRecord ?? "-"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  철인3종 탭 콘텐츠                                                   */
/* ------------------------------------------------------------------ */

function TriathlonContent({ events }: { events: TriathlonEvent[] }) {
  const hasAny = events.some((e) => e.entries.length > 0);

  if (!hasAny) {
    return (
      <div className="px-6">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col px-6 pt-2">
      {events.map((evt) => {
        if (evt.entries.length === 0) return null;

        return (
          <div key={evt.eventType} className="mb-4 last:mb-0">
            <h3 className="pb-1 pt-2 text-xs font-semibold tracking-wide text-muted-foreground">
              {evt.label}
            </h3>
            {evt.entries.map((entry) => (
              <div
                key={`tri-${entry.rank}-${entry.name}`}
                className="flex items-center gap-4 border-b border-border py-4 last:border-b-0"
              >
                <RankBadge rank={entry.rank} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-foreground">
                    {entry.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.raceName ?? "-"}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono text-lg font-bold",
                    entry.rank === 1 ? "text-primary" : "text-foreground",
                  )}
                >
                  {entry.record}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  메인 컴포넌트                                                       */
/* ------------------------------------------------------------------ */

export function RecordsClient({ data }: { data: RecordsData }) {
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>("marathon");

  return (
    <div className="flex flex-col gap-4">
      {/* 카테고리 탭 */}
      <div className="flex gap-2 px-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setSelectedCategory(cat.key)}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
              selectedCategory === cat.key
                ? "bg-foreground text-background"
                : "border-[1.5px] border-border text-muted-foreground",
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 카테고리별 콘텐츠 */}
      {selectedCategory === "marathon" && (
        <MarathonContent events={data.marathon.events} />
      )}
      {selectedCategory === "trail" && (
        <TrailContent entries={data.trail.entries} />
      )}
      {selectedCategory === "triathlon" && (
        <TriathlonContent events={data.triathlon.events} />
      )}
    </div>
  );
}
