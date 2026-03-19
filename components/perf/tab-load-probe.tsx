"use client";

import { useEffect } from "react";
import { isTabPerfEnabled, readAndClearTabStart } from "@/lib/perf-tab";

type TabLoadProbeProps = {
  href: string;
  label: string;
};

export function TabLoadProbe({ href, label }: TabLoadProbeProps) {
  useEffect(() => {
    if (!isTabPerfEnabled()) return;
    const start = readAndClearTabStart();
    if (!start) {
      console.log(`[TAB-PERF] ${label}(${href}) mounted (direct/open refresh)`);
      return;
    }
    const durationMs = performance.now() - start.startedAt;
    console.log(
      `[TAB-PERF] ${start.label}(${start.href}) -> ${label}(${href}) ${durationMs.toFixed(1)}ms`,
    );
  }, [href, label]);

  return null;
}
