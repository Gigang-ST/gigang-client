"use client";

import { useState } from "react";

import { FileText, Plus, Trophy, Users } from "lucide-react";

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
  defaultDate?: string;
};

export function AddScheduleDropdown({ onAddSchedule, onAddCompetition }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="fixed bottom-24 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 active:scale-95"
          aria-label="일정 추가"
        >
          <Plus className="size-6" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48" onInteractOutside={(e) => {
        const target = e.target as HTMLElement;
        if (target?.closest?.("[data-radix-dropdown-menu-trigger]")) e.preventDefault();
      }}>
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
            <span className="text-[13px] font-medium">정보 공유</span>
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
