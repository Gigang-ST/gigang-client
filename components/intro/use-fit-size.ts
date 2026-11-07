"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

const MEASURE_AT = 100;

/**
 * One size for every line in a set: the size at which the longest of them
 * spans the box exactly. Short lines then sit short, but nothing wraps and
 * nothing changes size mid-sequence.
 */
export function useFitSize(
  box: RefObject<HTMLElement | null>,
  ruler: RefObject<HTMLElement | null>,
  deps: readonly string[],
  { max = 132, min = 16 }: { max?: number; min?: number } = {},
) {
  const [size, setSize] = useState(min);
  const key = deps.join("|");

  useLayoutEffect(() => {
    const fit = () => {
      const width = box.current?.clientWidth ?? 0;
      const widest = Math.max(
        0,
        ...Array.from(ruler.current?.children ?? []).map(
          (child) => (child as HTMLElement).scrollWidth,
        ),
      );
      if (!width || !widest) return;
      setSize(Math.max(min, Math.min(max, (MEASURE_AT * width) / widest)));
    };

    fit();
    document.fonts?.ready.then(fit).catch(() => {});

    const observer = new ResizeObserver(fit);
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [box, ruler, key, max, min]);

  return { size, measureAt: MEASURE_AT };
}
