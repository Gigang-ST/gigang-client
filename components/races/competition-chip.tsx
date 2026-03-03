"use client";

import { cn } from "@/lib/utils";
import type { Competition } from "./types";
import { resolveSportConfig } from "./sport-config";

interface CompetitionChipProps {
  competition: Competition;
  onClick: () => void;
  isRegistered?: boolean;
  truncate?: boolean;
  className?: string;
}

export function CompetitionChip({
  competition,
  onClick,
  isRegistered = false,
  truncate = true,
  className,
}: CompetitionChipProps) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-opacity hover:opacity-80 cursor-pointer",
        truncate ? "truncate" : "whitespace-normal",
        resolveSportConfig(competition.sport).chipClass,
        isRegistered &&
          "!bg-primary !text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background font-bold",
        className,
      )}
      title={competition.title}
    >
      {competition.title}
    </button>
  );
}
