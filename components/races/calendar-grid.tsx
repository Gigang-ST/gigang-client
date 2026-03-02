"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Competition, CompetitionRegistration } from "./types";
import { CompetitionChip } from "./competition-chip";
import { getCalendarCells } from "./date-utils";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

interface CalendarGridProps {
  currentDate: Date;
  competitionsByDate: Map<string, Competition[]>;
  registrationsByCompetitionId: Record<string, CompetitionRegistration>;
  onSelectCompetition: (competition: Competition) => void;
}

export function CalendarGrid({
  currentDate,
  competitionsByDate,
  registrationsByCompetitionId,
  onSelectCompetition,
}: CalendarGridProps) {
  const cells = useMemo(() => getCalendarCells(currentDate), [currentDate]);

  return (
    <div className="flex flex-1 flex-col overflow-visible border-t border-white/10 bg-white/[0.01]">
      <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.02]">
        {DAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={cn(
              "px-2 py-2 text-center text-xs font-semibold",
              index === 0 && "text-destructive",
              index === 6 && "text-primary",
              index > 0 && index < 6 && "text-muted-foreground",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 grid-rows-6 overflow-visible">
        {cells.map((cell) => {
          const competitions = competitionsByDate.get(cell.dateStr) ?? [];
          const dayOfWeek = new Date(`${cell.dateStr}T00:00:00`).getDay();

          return (
            <div
              key={cell.dateStr}
              className={cn(
                "group relative flex flex-col border-b border-r border-white/10 p-1 text-left transition-colors hover:bg-white/[0.04] lg:p-1.5",
                !cell.isCurrentMonth && "bg-white/[0.005]",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium lg:size-7 lg:text-sm",
                  cell.isToday && "bg-primary text-primary-foreground font-bold",
                  !cell.isToday && cell.isCurrentMonth && dayOfWeek === 0 && "text-destructive",
                  !cell.isToday && cell.isCurrentMonth && dayOfWeek === 6 && "text-primary",
                  !cell.isToday && cell.isCurrentMonth && dayOfWeek > 0 && dayOfWeek < 6 && "text-foreground",
                  !cell.isCurrentMonth && "text-muted-foreground/50",
                )}
              >
                {cell.day}
              </span>

              <div className="mt-0.5 flex flex-col gap-0.5">
                {competitions.slice(0, 3).map((competition) => (
                  <CompetitionChip
                    key={competition.id}
                    competition={competition}
                    onClick={() => onSelectCompetition(competition)}
                    isRegistered={Boolean(
                      registrationsByCompetitionId[competition.id],
                    )}
                  />
                ))}
                {competitions.length > 3 && (
                  <div className="relative">
                    <span className="px-1 text-[10px] text-muted-foreground">
                      +{competitions.length - 3}
                    </span>
                    <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-56 max-h-48 overflow-y-auto rounded-md border border-white/40 bg-white/90 p-2 text-foreground shadow-lg opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                      <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
                        전체 일정
                      </div>
                      <div className="flex flex-col gap-1">
                        {competitions.map((competition) => (
                          <CompetitionChip
                            key={`${competition.id}-full`}
                            competition={competition}
                            onClick={() => onSelectCompetition(competition)}
                            isRegistered={Boolean(
                              registrationsByCompetitionId[competition.id],
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
