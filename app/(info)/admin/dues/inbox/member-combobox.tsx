"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { memberLabel } from "@/lib/dues/homonyms";
import type { MemberOption } from "@/lib/queries/dues";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** 후보에 없는 회원을 이름으로 검색해 지정. 동명이인이면 생년월일로 구분(memberLabel). */
export function MemberCombobox({
  members,
  value,
  dupNames,
  onSelect,
}: {
  members: MemberOption[];
  value: string | null;
  dupNames: Set<string>;
  onSelect: (memId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = members.find((m) => m.memId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="justify-between font-normal"
        >
          {selected ? memberLabel(selected, dupNames) : "직접 선택…"}
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="이름 검색…" />
          <CommandList>
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem
                  key={m.memId}
                  value={`${m.name} ${m.memId}`}
                  onSelect={() => {
                    onSelect(m.memId);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === m.memId ? "opacity-100" : "opacity-0")} />
                  {memberLabel(m, dupNames)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
