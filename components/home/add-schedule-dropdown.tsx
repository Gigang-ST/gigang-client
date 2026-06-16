"use client";

import { useState } from "react";

import { ChevronUp, FileText, Trophy, Users } from "lucide-react";


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  onAddSchedule: () => void;
  onAddCompetition: () => void;
};

export function AddScheduleDropdown({ onAddSchedule, onAddCompetition }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          추가
          <ChevronUp
            className="size-3 text-primary-foreground/70 transition-transform duration-150"
            style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48">
        <DropdownMenuItem
          onSelect={() => onAddCompetition()}
          className="flex items-center gap-3 py-2"
        >
          <Trophy className="size-4 shrink-0 text-warning" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium">대회</span>
            <span className="text-[11px] text-muted-foreground">선택 또는 등록</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onAddSchedule()}
          className="flex items-center gap-3 py-2"
        >
          <FileText className="size-4 shrink-0 text-info" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium">피드</span>
            <span className="text-[11px] text-muted-foreground">대회 접수, 세일, 세션 등</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled
          className="flex items-center gap-3 py-2"
        >
          <Users className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium">모임</span>
            <span className="text-[11px] text-muted-foreground">준비 중</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
