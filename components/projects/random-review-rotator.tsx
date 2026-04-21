"use client";

import { useEffect, useMemo, useState } from "react";
import { Caption } from "@/components/common/typography";

export type ReviewLine = {
  id: string;
  quote: string;
  meta: string;
};

type RandomReviewRotatorProps = {
  lines: ReviewLine[];
};

function pickRandomFive(lines: ReviewLine[]): ReviewLine[] {
  const shuffled = [...lines];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, 5);
}

export function RandomReviewRotator({ lines }: RandomReviewRotatorProps) {
  const picks = useMemo(() => pickRandomFive(lines), [lines]);
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
    setIsAnimating(false);
  }, [picks]);

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
    };
  }, [isPaused, picks.length]);

  if (picks.length === 0) return null;

  const current = picks[index] ?? picks[0];
  const next = picks[(index + 1) % picks.length] ?? current;
  if (!current) return null;

  return (
    <div
      className="rounded-2xl bg-muted px-4 py-3"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onTouchCancel={() => setIsPaused(false)}
    >
      <div className="overflow-hidden">
        <div
          className="transition-transform duration-500 ease-in-out motion-reduce:transition-none"
          style={{ transform: isAnimating ? "translateY(-50%)" : "translateY(0%)" }}
        >
          {[current, next].map((line, idx) => (
            <div key={`${line.id}-${idx}`} className="flex min-h-[44px] flex-col justify-center">
              <Caption className="line-clamp-1 text-foreground">"{line.quote}"</Caption>
              <Caption className="line-clamp-1 text-muted-foreground">{line.meta}</Caption>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
