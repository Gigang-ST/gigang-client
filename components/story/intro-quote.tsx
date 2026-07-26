"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** 툴팁 자동 소멸 시간 — 칭호 배지·가입목적 툴팁과 같은 3초 */
const TIP_MS = 3000;

/**
 * 인용구 한마디 — 한 줄로 눕히고 넘치면 `…`으로 자른다. **탭하면 전체 문장**이 툴팁으로 뜬다.
 *
 * 리드 활동지수 슬롯은 인용구를 좌우 2단 아래 한 줄에 눕히는데(폭이 좁아 긴 한마디는 잘린다),
 * 잘린 뒤를 읽을 방법이 없으면 답답하다. 칭호 배지(TitleBadge)·가입목적 칩과 같은 탭 툴팁으로
 * 그 자리에서 펼쳐 준다 — 페이지 이동 없이. 포털로 body에 띄워 부모 overflow에 안 잘린다.
 */
export function IntroQuote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 스크롤하면 닫는다(앵커가 움직여 위치가 어긋나므로) — 칭호·가입목적 툴팁과 동일.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);

  // 열린 뒤 버블 크기를 재서 앵커 위 중앙에 배치, 화면 밖으로 나가면 안쪽으로 당긴다.
  // pos가 없을 때만 1회 측정한다(효과 안에서 매번 setState하면 렌더가 연쇄된다).
  useEffect(() => {
    if (!open || pos !== null) return;
    const anchor = btnRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) return;

    const aRect = anchor.getBoundingClientRect();
    const bRect = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const MARGIN = 8;

    let left = aRect.left + aRect.width / 2 - bRect.width / 2;
    const top = aRect.top - bRect.height - 6;
    if (left + bRect.width + MARGIN > vw) left = vw - bRect.width - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setPos({ top, left });
  }, [open, pos]);

  function toggle() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null); // 다음 열림에서 위치를 다시 잰다(앵커가 움직였을 수 있음)
    setOpen(true);
    timerRef.current = setTimeout(() => setOpen(false), TIP_MS);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`한마디: ${text}`}
        // 인용구 배경 블록 — 왼쪽 세로 바 + 은은한 배경으로 "사람의 말"임을 나타내고, 명조(리디바탕).
        // 한 줄로 눕다 넘치면 truncate(…). w-full로 남는 폭을 다 쓰고, 탭 영역이 곧 한마디 전체다.
        className="block w-full truncate rounded-r-md border-l-2 border-border bg-muted/50 py-1.5 pl-2.5 pr-2 text-left font-serif text-[13.5px] leading-relaxed text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        “{text}”
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={bubbleRef}
            style={
              pos
                ? { position: "fixed", top: pos.top, left: pos.left }
                : { position: "fixed", visibility: "hidden" }
            }
            className={cn(
              "z-[9999] max-w-[260px] whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5",
              "bg-zinc-800 font-serif text-[12px] leading-relaxed text-zinc-100",
              "dark:bg-zinc-700 dark:text-zinc-50",
              "pointer-events-none select-none",
              "animate-in fade-in-0 zoom-in-95 duration-150",
            )}
          >
            “{text}”
          </div>,
          document.body,
        )}
    </>
  );
}
