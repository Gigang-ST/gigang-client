"use client";

import { memberLabel } from "@/lib/dues/homonyms";

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
 * 동명이인은 생년월일로 가른다(`memberLabel` — 회비 인박스와 같은 표기).
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
  const dupNames = new Set(members.filter((m) => m.birthDt).map((m) => m.name));

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
                  value={`${m.name} ${m.memId}`}
                  onSelect={() => onSelect(m)}
                >
                  {memberLabel(m, dupNames)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
