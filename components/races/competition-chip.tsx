"use client";

import { cn } from "@/lib/utils";
import type { Competition } from "./types";
import { resolveSportConfig } from "./sport-config";

interface CompetitionChipProps {
  competition: Competition;
  onClick: () => void;
  isRegistered?: boolean;
}

export function CompetitionChip({
  competition,
  onClick,
  isRegistered = false,
}: CompetitionChipProps) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-opacity hover:opacity-80 cursor-pointer",
        resolveSportConfig(competition.sport).chipClass,
        isRegistered &&
          "bg-primary text-primary-foreground ring-1 ring-offset-1 ring-primary",
      )}
      title={competition.title}
    >
      {competition.title}
    </button>
  );
}
