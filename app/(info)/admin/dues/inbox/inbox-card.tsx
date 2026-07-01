"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { cn } from "@/lib/utils";

import { Body, Caption, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { InboxTxn } from "@/lib/queries/dues";

export type ItemCd = "due" | "event_fee" | "other";

export type Decision = {
  memId: string | null;
  itemCd: ItemCd;
  remember: boolean;
};

export const ITEM_LABEL: Record<ItemCd, string> = { due: "회비", event_fee: "프로젝트", other: "제외" };
export const ITEM_ORDER: ItemCd[] = ["due", "event_fee", "other"];

/** 회원 검색 콤보박스 — 후보 목록에 없는 회원을 직접 찾아 지정할 때 사용 (~100명 규모라 Command 검색이 적합). */
function MemberCombobox({
  members,
  value,
  onSelect,
}: {
  members: { memId: string; name: string }[];
  value: string | null;
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
          {selected ? selected.name : "직접 선택…"}
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="이름 검색…" />
          <CommandList>
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem
                  key={m.memId}
                  value={m.name}
                  onSelect={() => {
                    onSelect(m.memId);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === m.memId ? "opacity-100" : "opacity-0")} />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Triage Inbox의 확인필요 카드 1건.
 * 키보드 단축키: 카드 자체(빈 영역)에 포커스된 상태에서 1/2/3 = 회비/프로젝트/제외,
 * Enter = 다음 카드로 포커스 이동. `e.target === e.currentTarget`으로 검사해
 * 내부 입력(회원 검색창 등)에서의 타이핑을 가로채지 않는다.
 */
export function InboxCard({
  txn,
  members,
  decision,
  onChange,
  cardRef,
  onEnterNext,
}: {
  txn: InboxTxn;
  members: { memId: string; name: string }[];
  decision: Decision;
  onChange: (patch: Partial<Decision>) => void;
  cardRef: (el: HTMLDivElement | null) => void;
  onEnterNext: () => void;
}) {
  const decided = decision.itemCd !== "due" || !!decision.memId;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "1") {
      onChange({ itemCd: "due" });
      e.preventDefault();
    } else if (e.key === "2") {
      onChange({ itemCd: "event_fee" });
      e.preventDefault();
    } else if (e.key === "3") {
      onChange({ itemCd: "other" });
      e.preventDefault();
    } else if (e.key === "Enter") {
      onEnterNext();
      e.preventDefault();
    }
  }

  return (
    <CardItem
      ref={cardRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !decided && "border-warning/60",
      )}
    >
      <div className="flex items-center justify-between">
        <Body className="font-semibold">{txn.amt.toLocaleString()}원</Body>
        <Micro>
          {dayjs(txn.txnDt).format("YY.MM.DD")} · {txn.rawName}
        </Micro>
      </div>

      {decision.itemCd === "due" && (
        <div className="flex flex-wrap items-center gap-2">
          {txn.candidates.length === 0 && <Caption>후보 없음 — 직접 선택</Caption>}
          {txn.candidates.map((c) => (
            <Button
              key={c.memId}
              type="button"
              size="sm"
              variant={decision.memId === c.memId ? "default" : "outline"}
              onClick={() => onChange({ memId: c.memId })}
            >
              {c.name} {Math.round(c.score * 100)}%
            </Button>
          ))}
          <MemberCombobox members={members} value={decision.memId} onSelect={(memId) => onChange({ memId })} />
        </div>
      )}

      <div className="flex gap-2">
        {ITEM_ORDER.map((cd) => (
          <Button
            key={cd}
            type="button"
            size="sm"
            variant={decision.itemCd === cd ? "default" : "outline"}
            onClick={() => onChange({ itemCd: cd })}
          >
            {ITEM_LABEL[cd]}
          </Button>
        ))}
      </div>

      {decision.itemCd === "due" && decision.memId && (
        <label className="flex items-center gap-2">
          <Checkbox
            checked={decision.remember}
            onCheckedChange={(checked) => onChange({ remember: checked === true })}
          />
          <Caption>이 이름 기억하기 (다음부터 자동)</Caption>
        </label>
      )}

      <Micro className="text-muted-foreground/70">1 회비 · 2 프로젝트 · 3 제외 · Enter 다음</Micro>
    </CardItem>
  );
}
