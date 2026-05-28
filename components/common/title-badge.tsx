import { cn } from "@/lib/utils";
import type { TitleEffect } from "@/lib/titles/types";

// 배경은 항상 어둡게 고정 — 라이트/다크 모드 무관하게 이펙트가 살아있도록
const BASE = "bg-zinc-900 dark:bg-zinc-900";

const EFFECT_COLOR: Record<TitleEffect, string> = {
  none:     "text-zinc-300 border-zinc-700",
  neon:     "text-sky-400 border-sky-400/60",
  hologram: "border-violet-400/40",
  gold:     "border-amber-400/50",
  spark:    "text-violet-300 border-violet-400/50",
};

const EFFECT_CLASS: Record<TitleEffect, string> = {
  none:     "",
  neon:     "title-effect-neon",
  hologram: "title-effect-hologram",
  gold:     "title-effect-gold",
  spark:    "title-effect-spark",
};

type TitleBadgeSize = "xs" | "sm" | "md";

const SIZE_CLASS: Record<TitleBadgeSize, string> = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-[11px] px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
};

export function TitleBadge({
  name,
  effect,
  size = "sm",
  className,
}: {
  name: string;
  effect: TitleEffect;
  size?: TitleBadgeSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border font-medium leading-none",
        BASE,
        SIZE_CLASS[size],
        EFFECT_COLOR[effect],
        className,
      )}
    >
      <span className={cn("inline-block", EFFECT_CLASS[effect])}>{name}</span>
    </span>
  );
}
