"use client";

import { useEffect, useRef, useState } from "react";

import { FileText, Plus, Trophy, Users } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  onAddSchedule: () => void;
  onAddCompetition: () => void;
  onAddGathering: () => void;
  defaultDate?: string;
};

const items = [
  {
    key: "competition",
    label: "대회",
    sub: "선택 또는 등록",
    icon: Trophy,
    color: "text-warning",
    disabled: false,
  },
  {
    key: "schedule",
    label: "정보 공유",
    sub: "대회 접수, 세일, 세션 등",
    icon: FileText,
    color: "text-info",
    disabled: false,
  },
  {
    key: "gathering",
    label: "모임",
    sub: "일반, 정기런, 이벤트",
    icon: Users,
    color: "text-violet-400",
    disabled: false,
  },
] as const;

export function AddScheduleDropdown({ onAddSchedule, onAddCompetition, onAddGathering }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 바깥 탭하면 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  function handleSelect(key: string) {
    setOpen(false);
    if (key === "competition") onAddCompetition();
    if (key === "schedule") onAddSchedule();
    if (key === "gathering") onAddGathering();
  }

  return (
    <div ref={containerRef} className={cn("fixed bottom-24 right-6 z-50 flex flex-col items-end gap-2", !open && "pointer-events-none")}>
      {/* Speed dial 카드 */}
      <div
        className={cn(
          "overflow-hidden rounded-2xl bg-background shadow-lg border border-border transition-all duration-200 origin-bottom-right",
          open ? "scale-100 opacity-100" : "scale-90 opacity-0 pointer-events-none",
        )}
      >
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              disabled={item.disabled}
              onClick={() => handleSelect(item.key)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 transition-colors",
                i < items.length - 1 && "border-b border-border",
                item.disabled
                  ? "cursor-not-allowed opacity-40"
                  : "hover:bg-muted active:bg-muted",
              )}
            >
              <Icon className={cn("size-5 shrink-0", item.color)} />
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{item.label}</span>
                <span className="text-[11px] text-muted-foreground">{item.sub}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* FAB */}
      <button
        className={cn(
          "pointer-events-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 active:scale-95",
          open && "rotate-45",
        )}
        aria-label="일정 추가"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="size-6" />
      </button>
    </div>
  );
}
