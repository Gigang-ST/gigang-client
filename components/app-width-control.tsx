"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  APP_WIDTHS,
  APP_WIDTH_DEFAULT,
  APP_WIDTH_EVENT,
  APP_WIDTH_KEY,
  type AppWidth,
  readStoredWidth,
  resolveShellWidth,
} from "@/lib/app-shell";
import { cn } from "@/lib/utils";

const LABELS: Record<AppWidth, string> = {
  480: "기본 폭",
  640: "넓게",
  800: "가장 넓게",
};

/**
 * 상태는 React가 아니라 **DOM·localStorage가 들고 있다**(useSyncExternalStore).
 *
 * 첫 페인트 전 인라인 스크립트가 이미 폭을 적용해 두므로 React가 같은 값을 state로 또
 * 들고 있으면 진실이 둘이 된다. 스냅샷을 문자열로 만들어 값이 그대로면 리렌더도 없다
 * (resize는 초당 수십 번 온다).
 */
function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener(APP_WIDTH_EVENT, onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener(APP_WIDTH_EVENT, onChange);
  };
}

function getSnapshot() {
  const pref = readStoredWidth();
  const resolved = resolveShellWidth(pref, window.innerWidth);
  return `${pref}|${resolved.width}|${resolved.inset ? 1 : 0}`;
}

/** 서버·하이드레이션 시점 — 뷰포트를 모르니 지면이 없다고 본다(렌더 안 함). */
const SERVER_SNAPSHOT = `${APP_WIDTH_DEFAULT}|${APP_WIDTH_DEFAULT}|0`;

/**
 * 셸 폭 컨트롤 — 데스크톱 왼쪽 지면(거터)에 붙는 세로 레일.
 *
 * 지면이 남을 때만(`inset`) 나타난다. 폰에서는 렌더 자체를 안 하므로 모바일 화면에
 * 새 요소가 끼어들지 않는다.
 *
 * ⚠️ 폭 계산은 `lib/app-shell.ts`가 정본이다 — 첫 페인트 전 인라인 스크립트와 같은 식을
 * 써야 새로고침 때 폭이 튀지 않는다.
 */
export function AppWidthControl() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const [prefRaw, widthRaw, insetRaw] = snapshot.split("|");
  const pref = Number(prefRaw) as AppWidth;
  const inset = insetRaw === "1";

  // 계산 결과를 DOM에 반영 — 인라인 스크립트가 이미 해 둔 것과 같은 값이라 첫 렌더엔 무변화,
  // 이후 창 크기·선택이 바뀔 때만 실제로 움직인다.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-max-w", `${widthRaw}px`);
    root.toggleAttribute("data-shell-inset", insetRaw === "1");
  }, [widthRaw, insetRaw]);

  function select(next: AppWidth) {
    try {
      window.localStorage.setItem(APP_WIDTH_KEY, String(next));
    } catch {
      // 사파리 프라이빗 등 — 저장만 실패하고 이번 세션엔 적용된다.
    }
    window.dispatchEvent(new Event(APP_WIDTH_EVENT));
  }

  if (!inset) return null;

  return (
    <div
      className="app-rail fixed top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-full border border-border bg-background/80 p-1 opacity-40 shadow-sm backdrop-blur transition-opacity focus-within:opacity-100 hover:opacity-100"
      role="group"
      aria-label="화면 폭"
    >
      {APP_WIDTHS.map((width, i) => (
        <button
          key={width}
          type="button"
          onClick={() => select(width)}
          title={`${LABELS[width]} (${width}px)`}
          aria-label={LABELS[width]}
          aria-pressed={pref === width}
          className={cn(
            "flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors",
            pref === width
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {/* 폭 자체를 그림으로 — 아이콘보다 "이만큼 넓어진다"가 바로 읽힌다. */}
          <span
            className="block h-0.5 rounded-full bg-current"
            style={{ width: 8 + i * 4 }}
          />
        </button>
      ))}
    </div>
  );
}
