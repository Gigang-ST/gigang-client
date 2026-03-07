"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type RankingEntry = {
  rank: number;
  name: string;
  record: string;
  raceName: string | null;
  utmbProfileUrl: string | null;
};

type EventData = {
  eventType: string;
  label: string;
  male: RankingEntry[];
  female: RankingEntry[];
  all: RankingEntry[];
};

type Category = {
  key: string;
  label: string;
  hasGender: boolean;
  events: EventData[];
};

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

export function RecordsClient({ data }: { data: Category[] }) {
  const [selectedCategory, setSelectedCategory] = useState(
    data[0]?.key ?? "marathon",
  );
  const [selectedEvent, setSelectedEvent] = useState(
    data[0]?.events[0]?.eventType ?? "10K",
  );
  const [selectedGender, setSelectedGender] = useState<"male" | "female">(
    "male",
  );

  const category = data.find((c) => c.key === selectedCategory);
  const currentEvent = category?.events.find(
    (e) => e.eventType === selectedEvent,
  );

  const entries = category?.hasGender
    ? selectedGender === "male"
      ? currentEvent?.male
      : currentEvent?.female
    : currentEvent?.all;

  const isUtmb = selectedEvent === "UTMB";

  function handleCategoryChange(key: string) {
    setSelectedCategory(key);
    const cat = data.find((c) => c.key === key);
    if (cat?.events[0]) {
      setSelectedEvent(cat.events[0].eventType);
    }
    setSelectedGender("male");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Category Tabs */}
      <div className="flex gap-2 px-6">
        {data.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => handleCategoryChange(cat.key)}
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

      {/* Event Sub-tabs (only if category has multiple events) */}
      {category && category.events.length > 1 && (
        <div className="flex gap-2 px-6">
          {category.events.map((evt) => (
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

      {/* Gender Tabs (only for categories with gender) */}
      {category?.hasGender && (
        <div className="flex items-center gap-0 px-6 py-2">
          <button
            type="button"
            onClick={() => setSelectedGender("male")}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              selectedGender === "male"
                ? "bg-foreground text-background"
                : "text-muted-foreground",
            )}
          >
            남성
          </button>
          <button
            type="button"
            onClick={() => setSelectedGender("female")}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              selectedGender === "female"
                ? "bg-foreground text-background"
                : "text-muted-foreground",
            )}
          >
            여성
          </button>
        </div>
      )}

      {/* Rank List */}
      <div className="flex flex-col px-6 pt-2">
        {entries && entries.length > 0 ? (
          entries.map((entry) => (
            <div
              key={`${entry.rank}-${entry.name}`}
              className="flex items-center gap-4 border-b border-border py-4 last:border-b-0"
            >
              {entry.rank <= 3 ? (
                <MedalBadge rank={entry.rank} />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center text-xl font-bold text-muted-foreground">
                  {entry.rank}
                </span>
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">
                  {entry.name}
                </span>
                {isUtmb ? (
                  entry.utmbProfileUrl ? (
                    <a
                      href={entry.utmbProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary"
                    >
                      UTMB 프로필
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )
                ) : (
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.raceName ?? "-"}
                  </span>
                )}
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
          ))
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            아직 등록된 기록이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
