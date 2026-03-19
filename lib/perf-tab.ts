"use client";

/** 운영에서 측정 켜기: 브라우저 콘솔에서 실행 후 새로고침 */
export const TAB_PERF_LOCALSTORAGE_KEY = "GIGANG_TAB_PERF";

const SESSION_KEY = "__gigang_tab_perf_start__";

type TabPerfPayload = {
  href: string;
  label: string;
  startedAt: number;
};

/** 로컬 개발은 항상 켜짐. 운영은 localStorage 플래그로만 켬(다른 사용자 콘솔 오염 방지). */
export function isTabPerfEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return window.localStorage.getItem(TAB_PERF_LOCALSTORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTabClickStart(href: string, label: string) {
  if (!isTabPerfEnabled()) return;
  const payload: TabPerfPayload = {
    href,
    label,
    startedAt: performance.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function readAndClearTabStart() {
  if (!isTabPerfEnabled()) return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(SESSION_KEY);
  try {
    return JSON.parse(raw) as TabPerfPayload;
  } catch {
    return null;
  }
}
