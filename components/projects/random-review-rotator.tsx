"use client";

import { useEffect, useState } from "react";

import { ChevronDown, ChevronUp } from "lucide-react";

import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { TitleBadge } from "@/components/common/title-badge";
import { Caption } from "@/components/common/typography";

export type ReviewLine = {
  id: string;
  quote: string;
  name: string;
  metaSuffix: string;
  ttlNm: string | null;
  ttlDesc: string | null;
  descVisibility: "always" | "others" | "held" | "never";
  badgeEffect: string | null;
  frameCd: string | null;
  isHeld: boolean;
  /** 정렬 기준 날짜 (YYYY-MM-DD) */
  actDt: string;
};

type RandomReviewRotatorProps = {
  lines: ReviewLine[];
};

function getPickCount(total: number): number {
  if (total >= 100) return Math.max(10, Math.floor(total * 0.1));
  return Math.min(10, total);
}

function pickRandomLines(lines: ReviewLine[]): ReviewLine[] {
  const shuffled = [...lines];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const picked = shuffled.slice(0, getPickCount(shuffled.length));
  return picked.sort((a, b) => b.actDt.localeCompare(a.actDt));
}

export function RandomReviewRotator({ lines }: RandomReviewRotatorProps) {
  const [picks, setPicks] = useState<ReviewLine[]>(() =>
    lines.slice(0, getPickCount(lines.length)),
  );
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [tooltipText, setTooltipText] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicks(pickRandomLines(lines));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAnimating(false);
  }, [lines]);

  useEffect(() => {
    if (picks.length <= 1 || isPaused || isExpanded) return;
    let timeoutId: number | undefined;
    const timer = window.setInterval(() => {
      setIsAnimating(true);
      timeoutId = window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % picks.length);
        setIsAnimating(false);
      }, 560);
    }, 4200);
    return () => {
      window.clearInterval(timer);
      if (timeoutId) window.clearTimeout(timeoutId);
      setIsAnimating(false);
    };
  }, [isPaused, picks.length, isExpanded]);

  if (picks.length === 0) return null;

  const current = picks[index] ?? picks[0];
  const next = picks[(index + 1) % picks.length] ?? current;
  if (!current) return null;

  const frameCls = getFrameCls(current.frameCd);

  if (isExpanded) {
    return (
      <div
        className="rounded-2xl bg-muted border select-none overflow-hidden"
        style={{
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        <div className="flex flex-col">
          {picks.map((line, i) => (
            <div
              key={line.id}
              className={cn("px-4 py-3", i < picks.length - 1 && "border-b border-border")}
            >
              <Caption className="wrap-break-word leading-4 text-foreground">
                &ldquo;{line.quote}&rdquo;
              </Caption>
              <Caption className="mt-0.5 line-clamp-1 text-muted-foreground flex items-center gap-1 flex-wrap">
                <span>{line.name}</span>
                {line.ttlNm && (
                  <TitleBadge
                    name={line.ttlNm}
                    effect={line.badgeEffect}
                    size="xs"
                    tooltip={{
                      desc: line.ttlDesc,
                      visibility: line.descVisibility,
                      isHeld: line.isHeld,
                      isOwner: false,
                    }}
                  />
                )}
                <span>{line.metaSuffix}</span>
              </Caption>
            </div>
          ))}
        </div>
        <button
          className="w-full flex items-center justify-center gap-1 py-2 border-t border-border"
          onClick={() => setIsExpanded(false)}
        >
          <Caption className="text-muted-foreground">접기</Caption>
          <ChevronUp className="size-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-2xl bg-muted border select-none overflow-hidden",
        frameCls,
      )}
      style={{
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {tooltipText && (
        <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-4 right-4 z-20 rounded-lg border bg-popover px-2 py-1 text-xs leading-4 text-popover-foreground shadow-md">
          {tooltipText}
        </div>
      )}
      <div
        className="px-4 pt-3 pb-2"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => {
          setIsPaused(false);
          setTooltipText(null);
        }}
        onTouchCancel={() => {
          setIsPaused(false);
          setTooltipText(null);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="h-[64px] overflow-hidden">
          <div
            className={
              isAnimating
                ? "transition-transform duration-500 ease-in-out motion-reduce:transition-none"
                : "transition-none motion-reduce:transition-none"
            }
            style={{ transform: isAnimating ? "translateY(-50%)" : "translateY(0%)" }}
          >
            {[current, next].map((line, idx) => (
              <div
                key={`${line.id}-${idx}`}
                className="flex h-[64px] flex-col justify-center"
                aria-hidden={idx === 1}
              >
                <Caption
                  className="line-clamp-2 wrap-break-word leading-4 text-foreground"
                  onTouchStart={(event) => {
                    event.preventDefault();
                    setTooltipText(line.quote);
                  }}
                  onTouchEnd={() => setTooltipText(null)}
                  onTouchCancel={() => setTooltipText(null)}
                >
                  &ldquo;{line.quote}&rdquo;
                </Caption>
                <Caption className="mt-0.5 line-clamp-1 text-muted-foreground flex items-center gap-1 flex-wrap">
                  <span>{line.name}</span>
                  {line.ttlNm && (
                    <TitleBadge
                      name={line.ttlNm}
                      effect={line.badgeEffect}
                      size="xs"
                      tooltip={{ desc: line.ttlDesc, visibility: line.descVisibility as "always" | "others" | "held" | "never", isHeld: line.isHeld, isOwner: false }}
                    />
                  )}
                  <span>{line.metaSuffix}</span>
                </Caption>
              </div>
            ))}
          </div>
        </div>
      </div>
      {picks.length > 1 && (
        <button
          className="w-full flex items-center justify-center gap-1 py-2 border-t border-border"
          onClick={() => setIsExpanded(true)}
        >
          <Caption className="text-muted-foreground">전체 {picks.length}개 보기</Caption>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
