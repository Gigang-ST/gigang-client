"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

function TooltipBubble({ anchorRef, text }: { anchorRef: React.RefObject<HTMLButtonElement | null>; text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble || pos !== null) return;

    const aRect = anchor.getBoundingClientRect();
    const bRect = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const MARGIN = 8;

    let left = aRect.left + aRect.width / 2 - bRect.width / 2;
    const top = aRect.top - bRect.height - 6;

    if (left + bRect.width + MARGIN > vw) left = vw - bRect.width - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setPos({ top, left });
  });

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={bubbleRef}
      style={pos ? { position: "fixed", top: pos.top, left: pos.left } : { position: "fixed", visibility: "hidden" }}
      className={cn(
        "z-[9999] max-w-[200px] break-words rounded-md px-2.5 py-1.5",
        "bg-zinc-800 text-[11px] leading-relaxed text-zinc-100",
        "dark:bg-zinc-700 dark:text-zinc-50",
        "pointer-events-none select-none",
        "animate-in fade-in-0 zoom-in-95 duration-150",
      )}
    >
      {text}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// 이펙트 CSS 맵
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// desc_visibility 설명 공개 여부 판단
// ---------------------------------------------------------------------------

export type TitleDescVisibility = "always" | "others" | "held" | "never";

/**
 * 칭호 "설명"의 공개 여부. 칭호 이름·배지 노출과는 무관하다(그건 `masked`의 몫).
 *
 * others가 무조건 true인 건 의도다 — 툴팁이 붙는 맥락은 이미 보유자가 있는 화면
 * (남의 카드·획득 피드·내 도감)이라, "보유자가 있으면 공개"가 곧 true다.
 * 누구 카드인지(isOwner)는 공개 여부를 가르지 않으므로 인자로 받지 않는다.
 */
function resolveDescVisible(
  visibility: TitleDescVisibility,
  isHeld: boolean,
): boolean {
  switch (visibility) {
    case "always": return true;
    case "others": return true;
    case "held":   return isHeld;
    case "never":  return false;
  }
}

// ---------------------------------------------------------------------------
// TitleBadge — 이펙트 렌더링 + 툴팁 통합 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 칭호 배지 컴포넌트.
 *
 * 기본 사용 (이펙트만, 툴팁 없음):
 *   <TitleBadge name="SUB4" effect="gold" size="sm" />
 *
 * 툴팁 포함 사용:
 *   <TitleBadge
 *     name="SUB4" effect="gold"
 *     tooltip={{ desc: "풀코스 4시간 벽을 넘은 러너", visibility: "others", isHeld: true }}
 *   />
 *
 * 컬렉션 선택 모드 (선택 상태 + 마스킹):
 *   <TitleBadge name="???" effect={null} masked selected onClick={...} />
 */
export function TitleBadge({
  name,
  effect,
  size = "sm",
  className,
  // 툴팁 관련
  tooltip,
  // 컬렉션 선택 모드
  selected,
  masked,
  onClick,
  tooltipOpen,
  onTooltipOpen,
}: {
  name: string;
  effect: string | null;
  size?: TitleBadgeSize;
  className?: string;
  /** 툴팁 설명 표시 옵션. 생략 시 툴팁 없음 */
  tooltip?: {
    desc: string | null;
    visibility: TitleDescVisibility;
    isHeld: boolean;
  };
  /** 컬렉션 선택 상태 */
  selected?: boolean;
  /** 미보유 마스킹 (칭호명 blur + 자물쇠) */
  masked?: boolean;
  onClick?: () => void;
  /** 외부에서 툴팁 열림 상태를 제어할 때 사용 (컬렉션 등 여러 배지가 공존하는 경우) */
  tooltipOpen?: boolean;
  onTooltipOpen?: () => void;
}) {
  const [tipOpenInternal, setTipOpenInternal] = useState(false);
  const tipOpen = tooltipOpen !== undefined ? tooltipOpen : tipOpenInternal;
  const setTipOpen = tooltipOpen !== undefined ? () => {} : setTipOpenInternal;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // 타이머 클린업
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // 탭 이동 시 닫기
  useEffect(() => { setTipOpen(false); }, [pathname]);

  // 스크롤 시 닫기
  useEffect(() => {
    if (!tipOpen) return;
    const close = () => setTipOpen(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [tipOpen]);

  const effectKey = effect ?? "none";
  const cls = BADGE_CSS[effectKey] ?? "";
  const border = BADGE_BORDER[effectKey] ?? "border-zinc-700 text-zinc-300";

  // 말풍선 텍스트: visibility 조건 통과하면 desc, 아니면 "???"
  // 말풍선 표시 여부는 tooltip prop 존재 여부로만 결정
  const descText = tooltip
    ? resolveDescVisible(tooltip.visibility, tooltip.isHeld)
      ? (tooltip.desc ?? "???")
      : "???"
    : null;

  const isInteractive = !!tooltip || !!onClick;

  function openTip() {
    if (tooltipOpen !== undefined) {
      onTooltipOpen?.();
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setTipOpenInternal(true);
      timerRef.current = setTimeout(() => setTipOpenInternal(false), 3000);
    }
  }

  function handleClick(e: React.MouseEvent) {
    // 배지는 부모가 클릭 가능한 행(예: 랭킹 행 → 프로필 카드) 안에 놓이는 일이 잦다.
    // 전파를 막지 않으면 툴팁과 부모 액션이 한 번의 탭으로 동시에 열린다.
    e.stopPropagation();
    if (tooltip && !masked) openTip();
    onClick?.();
  }

  // 컬렉션 선택 모드일 때 스타일 오버라이드
  const collectionStyle = masked
    ? "cursor-default select-none border-dashed border-border/50 bg-muted/50 text-muted-foreground/40"
    : selected
      ? "border-primary bg-primary/10 text-primary"
      : undefined;

  const inner = masked ? (
    <>
      <Lock className="size-2.5 shrink-0" />
      <span className="blur-[2px]">{name}</span>
    </>
  ) : (
    <>
      {effectKey === "glitch"
        ? <span className={cn("inline-block", cls)} data-text={name}>{name}</span>
        : cls
          ? <span className={cn("inline-block", cls)}>{name}</span>
          : name
      }
      {selected && <Check className="size-3 ml-0.5" />}
    </>
  );

  const badgeCls = cn(
    "inline-flex shrink-0 items-center rounded-full border bg-zinc-900 dark:bg-transparent font-medium leading-none",
    SIZE_CLASS[size],
    collectionStyle ?? border,
    className,
  );

  if (!isInteractive) {
    return <span className={badgeCls}>{inner}</span>;
  }

  return (
    <div className="relative inline-flex overflow-visible">
      <button
        ref={btnRef}
        onClick={handleClick}
        disabled={masked}
        className={badgeCls}
      >
        {inner}
      </button>

      {/* 말풍선 툴팁 — 배지 위에 떠서 3초 후 자동 소멸 */}
      {tooltip && tipOpen && !masked && (
        <TooltipBubble anchorRef={btnRef} text={descText ?? "???"} />
      )}
    </div>
  );
}
