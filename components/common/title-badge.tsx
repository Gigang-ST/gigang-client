import { cn } from "@/lib/utils";

const BADGE_CSS: Record<string, string> = {
  none: "", dim: "title-effect-dim", breathe: "title-effect-breathe",
  "italic-drift": "title-effect-italic-drift", "dot-blink": "title-effect-dot-blink",
  "glow-soft": "title-effect-glow-soft", "soft-shine": "title-effect-soft-shine",
  silver: "title-effect-silver", "underline-fade": "title-effect-underline-fade",
  flare: "title-effect-flare", bronze: "title-effect-bronze", neon: "title-effect-neon",
  emerald: "title-effect-emerald", sapphire: "title-effect-sapphire",
  gold: "title-effect-gold", ice: "title-effect-ice", pearl: "title-effect-pearl",
  titanium: "title-effect-titanium", hologram: "title-effect-hologram",
  "aurora-text": "title-effect-aurora-text", "pulse-color": "title-effect-pulse-color",
  "void-text": "title-effect-void-text", ruby: "title-effect-ruby",
  amethyst: "title-effect-amethyst", fire: "title-effect-fire",
  rainbow: "title-effect-rainbow", plasma: "title-effect-plasma",
  lava: "title-effect-lava", crimson: "title-effect-crimson",
  matrix: "title-effect-matrix", glitch: "title-effect-glitch",
  chromatic: "title-effect-chromatic", wave: "title-effect-wave",
  zoom: "title-effect-zoom", bounce: "title-effect-bounce",
  shake: "title-effect-shake", flip: "title-effect-flip",
  typewriter: "title-effect-typewriter",
  "bounce-rainbow": "title-effect-bounce-rainbow", "bounce-ice": "title-effect-bounce-ice",
  "shake-fire": "title-effect-shake-fire", "wave-hologram": "title-effect-wave-hologram",
  "flip-gold": "title-effect-flip-gold", obsidian: "title-effect-obsidian",
  "shake-lava": "title-effect-shake-lava", "zoom-plasma": "title-effect-zoom-plasma",
  "zoom-rainbow": "title-effect-zoom-rainbow", "wave-fire": "title-effect-wave-fire",
  spark: "title-effect-spark",
};

const BADGE_BORDER: Record<string, string> = {
  none: "border-zinc-700 text-zinc-300",
  dim: "border-zinc-600", breathe: "border-zinc-500",
  "italic-drift": "border-zinc-600", "dot-blink": "border-zinc-600",
  "glow-soft": "border-zinc-500", "soft-shine": "border-slate-400/60",
  silver: "border-slate-400/60", "underline-fade": "border-sky-400/40",
  flare: "border-sky-400/50", bronze: "border-amber-700/60",
  neon: "border-sky-400/60 text-sky-400", emerald: "border-emerald-500/50",
  sapphire: "border-blue-500/50", gold: "border-amber-400/50",
  ice: "border-cyan-400/50", pearl: "border-slate-300/60",
  titanium: "border-slate-500/50", hologram: "border-violet-400/50",
  "aurora-text": "border-emerald-400/50", "pulse-color": "border-violet-400/50",
  "void-text": "border-indigo-500/50", ruby: "border-rose-500/50",
  amethyst: "border-purple-500/50", fire: "border-orange-500/60",
  rainbow: "border-pink-400/50", plasma: "border-fuchsia-500/50",
  lava: "border-red-600/60", crimson: "border-red-500/60",
  matrix: "border-green-500/50 text-green-400",
  glitch: "border-slate-500 text-slate-200",
  chromatic: "border-slate-500", wave: "border-sky-400/50",
  zoom: "border-fuchsia-400/50", bounce: "border-orange-400/50 text-orange-400",
  shake: "border-red-400/50 text-red-400", flip: "border-violet-400/50",
  typewriter: "border-green-400/50 text-green-400",
  "bounce-rainbow": "border-pink-400/50", "bounce-ice": "border-cyan-400/50",
  "shake-fire": "border-orange-500/60", "wave-hologram": "border-violet-400/50",
  "flip-gold": "border-amber-400/50", obsidian: "border-indigo-500/50",
  "shake-lava": "border-red-600/60", "zoom-plasma": "border-fuchsia-500/60",
  "zoom-rainbow": "border-pink-400/60", "wave-fire": "border-orange-500/60",
  spark: "border-violet-400/50 text-violet-300",
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
  effect: string | null;
  size?: TitleBadgeSize;
  className?: string;
}) {
  const effectKey = effect ?? "none";
  const cls = BADGE_CSS[effectKey] ?? "";
  const border = BADGE_BORDER[effectKey] ?? "border-zinc-700 text-zinc-300";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border bg-zinc-900 font-medium leading-none",
        SIZE_CLASS[size],
        border,
        className,
      )}
    >
      {effectKey === "glitch"
        ? <span className={cn("inline-block", cls)} data-text={name}>{name}</span>
        : cls
          ? <span className={cn("inline-block", cls)}>{name}</span>
          : name
      }
    </span>
  );
}
