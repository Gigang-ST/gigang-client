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
  const shuffled = [...lines].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

export function RandomReviewRotator({ lines }: RandomReviewRotatorProps) {
  const picks = useMemo(() => pickRandomFive(lines), [lines]);
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (picks.length <= 1 || isPaused) return;
    let timeoutId: number | undefined;
    const timer = window.setInterval(() => {
      setIsTransitioning(true);
      timeoutId = window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % picks.length);
        setIsTransitioning(false);
      }, 280);
    }, 3000);
    return () => {
      window.clearInterval(timer);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isPaused, picks.length]);

  if (picks.length === 0) return null;

  const current = picks[index] ?? picks[0];
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
    >
      <div
        className={`transition-all duration-300 ease-out motion-reduce:transition-none ${
          isTransitioning ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <Caption className="line-clamp-1 text-foreground">"{current.quote}"</Caption>
        <Caption className="line-clamp-1 text-muted-foreground">{current.meta}</Caption>
      </div>
    </div>
  );
}
