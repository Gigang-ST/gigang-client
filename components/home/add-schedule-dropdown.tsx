"use client";

import { useState } from "react";

import { ChevronUp, FileText, Trophy } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
        <button className="flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary/70">
          <span className="text-[15px] leading-none">+</span>
          일정 추가
          <ChevronUp
            className="size-3 text-muted-foreground transition-transform duration-150"
            style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48">
        <DropdownMenuItem
          onClick={() => { setOpen(false); onAddCompetition(); }}
          className="flex items-start gap-3 py-2.5"
        >
          <Trophy className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium">대회 추가</span>
            <span className="text-[11px] text-muted-foreground">대회 선택 또는 직접 등록</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => { setOpen(false); onAddSchedule(); }}
          className="flex items-start gap-3 py-2.5"
        >
          <FileText className="mt-0.5 size-4 shrink-0 text-info" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium">정보 일정 추가</span>
            <span className="text-[11px] text-muted-foreground">공지, 훈련 등 정보 공유</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
