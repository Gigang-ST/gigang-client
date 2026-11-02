"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { RecordMemberOption } from "./records-client";

/**
 * 기록 등록 1단계 — 누구의 기록인지 고른다. 고르면 회원 기록 입력 다이얼로그가 이어서 열린다.
 * 표시 이름(동명이인 구분 포함)은 서버가 지어 넘긴다(`page.tsx`).
 */
export function RecordMemberPicker({
  open,
  onOpenChange,
  members,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: RecordMemberOption[];
  onSelect: (member: RecordMemberOption) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-0 sm:max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>기록 등록</DialogTitle>
          <DialogDescription>누구의 기록인가요?</DialogDescription>
        </DialogHeader>
        <Command className="border-t border-border">
          <CommandInput placeholder="이름 검색" />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem
                  key={m.memId}
                  value={`${m.label} ${m.memId}`}
                  onSelect={() => onSelect(m)}
                >
                  {m.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
