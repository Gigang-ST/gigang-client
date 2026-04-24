"use client";

import { useEffect, useState } from "react";
import { Caption } from "@/components/common/typography";

export type ReviewLine = {
  id: string;
  quote: string;
  meta: string;
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
  return shuffled.slice(0, getPickCount(shuffled.length));
}

export function RandomReviewRotator({ lines }: RandomReviewRotatorProps) {
  // SSR/CSR 첫 렌더를 동일하게 맞추기 위해 초기값은 고정 순서로 자른다.
  const [picks, setPicks] = useState<ReviewLine[]>(() =>
    lines.slice(0, getPickCount(lines.length)),
  );
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [tooltipText, setTooltipText] = useState<string | null>(null);

  useEffect(() => {
    setPicks(pickRandomLines(lines));
    setIndex(0);
    setIsAnimating(false);
  }, [lines]);

  useEffect(() => {
    if (picks.length <= 1 || isPaused) return;
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
  }, [isPaused, picks.length]);

  if (picks.length === 0) return null;

  const current = picks[index] ?? picks[0];
  const next = picks[(index + 1) % picks.length] ?? current;
  if (!current) return null;

  return (
    <div
      className="relative rounded-2xl bg-muted px-4 py-3 select-none"
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
                "{line.quote}"
              </Caption>
              <Caption className="mt-0.5 line-clamp-1 text-muted-foreground">{line.meta}</Caption>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
