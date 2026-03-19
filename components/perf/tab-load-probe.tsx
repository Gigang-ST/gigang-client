"use client";

import { useEffect } from "react";
import { isTabPerfEnabled, readAndClearTabStart } from "@/lib/perf-tab";

type TabLoadProbeProps = {
  href: string;
  label: string;
};

/** 다음 페인트 직후에 로그 (DOM 반영 후에 가깝게 측정) */
function afterNextPaint(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

export function TabLoadProbe({ href, label }: TabLoadProbeProps) {
  useEffect(() => {
    if (!isTabPerfEnabled()) return;
    const start = readAndClearTabStart();
    afterNextPaint(() => {
      if (!start) {
        console.log(`[TAB-PERF] ${label}(${href}) 콘텐츠 표시 (direct/open refresh)`);
        return;
      }
      const durationMs = performance.now() - start.startedAt;
      console.log(
        `[TAB-PERF] ${start.label}(${start.href}) -> ${label}(${href}) ${durationMs.toFixed(1)}ms (탭 클릭 ~ 본문 데이터 렌더+다음 페인트)`,
      );
    });
  }, [href, label]);

  return null;
}
