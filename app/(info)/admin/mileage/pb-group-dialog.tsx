"use client";

import { useState } from "react";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { groupColorClass, PB_GROUP_COLOR_NOS } from "./pb-game-parts";

export type PbGroupFormValues = { grpNm: string; colorNo: number };

function GroupForm({
  initial,
  usedColorNos,
  busy,
  submitLabel,
  onSubmit,
}: {
  initial: PbGroupFormValues;
  /** 다른 팀이 이미 쓰는 색 — 막지는 않고 「사용 중」만 알린다(색이 겹치면 점수판에서 팀을 못 가린다) */
  usedColorNos: number[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (values: PbGroupFormValues) => void;
}) {
  const [name, setName] = useState(initial.grpNm);
  const [colorNo, setColorNo] = useState(initial.colorNo);
  const trimmed = name.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pb-group-name" className="text-sm font-medium text-foreground">
            팀 이름
          </label>
          <Input
            id="pb-group-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 번개팀"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">팀 색</span>
          <div className="flex gap-3">
            {PB_GROUP_COLOR_NOS.map((n) => {
              const selected = colorNo === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`색 ${n}${usedColorNos.includes(n) ? " (사용 중)" : ""}`}
                  onClick={() => setColorNo(n)}
                  className={cn(
                    "relative flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow",
                    groupColorClass(n),
                    selected ? "ring-2 ring-foreground" : "ring-0",
                  )}
                >
                  {selected && <Check className="size-5 text-background" aria-hidden />}
                  {!selected && usedColorNos.includes(n) && (
                    <span className="size-1.5 rounded-full bg-background/80" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          {usedColorNos.length > 0 && (
            <Caption>점이 찍힌 색은 다른 팀이 쓰고 있어요.</Caption>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-border p-4">
        <Button
          disabled={!trimmed || busy}
          onClick={() => onSubmit({ grpNm: trimmed, colorNo })}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {busy ? "저장 중..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * 게임팀 추가·수정(`mode`).
 * 폼 `key`를 열 때마다 바꿔 이전 팀의 입력값이 남지 않게 한다.
 */
export function PbGroupDialog({
  open,
  onOpenChange,
  mode,
  formKey,
  initial,
  usedColorNos,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  formKey: string;
  initial: PbGroupFormValues;
  usedColorNos: number[];
  busy: boolean;
  onSubmit: (values: PbGroupFormValues) => void;
}) {
  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="max-h-[85dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>{mode === "create" ? "게임팀 추가" : "게임팀 수정"}</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>팀 이름과 색을 정해요. 점수판에 이 색으로 표시돼요.</ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>
        <GroupForm
          key={formKey}
          initial={initial}
          usedColorNos={usedColorNos}
          busy={busy}
          submitLabel={mode === "create" ? "추가" : "저장"}
          onSubmit={onSubmit}
        />
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
