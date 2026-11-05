"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Caption } from "@/components/common/typography";
import { teamColorClass } from "./pb-team-color";

/** 넘겨 보는 한 장 — 카드 마크업은 서버가 그려 넘긴다(이 섬은 넘김만 맡는다) */
export type PbTeamsCarouselSlide = {
  key: string;
  /** 스크린리더에 읽히는 이름 — 「번개팀」 / 「팀 없음」 */
  label: string;
  /** 위치 점의 색 — 팀 없음은 null(무채색) */
  colorNo: number | null;
  node: ReactNode;
};

/** 가로 이동이 이만큼 넘고 세로보다 커야 한 장 넘긴다(기강이야기 리드와 같은 문턱) */
const SWIPE_MIN_PX = 40;
/** 스와이프 직후 이 시간 안에 온 click은 스와이프의 꼬리로 보고 버린다 — 사진 위에서 밀면 릴스가 열리지 않게 */
const SWIPE_CLICK_GUARD_MS = 400;

/**
 * Teams 칸 넘김(#624) — 한 번에 한 장, 좌우 화살표 + 스와이프. **끝에서 감기지 않는다**(끝 화살표가 꺼진다).
 *
 * - 순서는 호출부가 정해 넘긴다(`orderPbTeamSlides` — 내 팀 첫 장, 팀 없음 끝 장). 그래서 늘 첫 장에서 시작한다.
 * - **모든 장을 한 칸(grid 1/1)에 겹쳐 둔다** — 칸 높이가 가장 긴 장에 맞춰 고정돼, 넘겨도 아래 내용이 튀지 않는다.
 *   안 보이는 장은 `inert`라 탭 이동·스크린리더에서 빠진다.
 * - `prefers-reduced-motion`이면 미끄러짐 없이 바로 바뀐다(`motion-reduce:transition-none`).
 */
export function PbTeamsCarousel({ slides }: { slides: PbTeamsCarouselSlide[] }) {
  const [index, setIndex] = useState(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const swipedAtRef = useRef(Number.NEGATIVE_INFINITY);

  const last = slides.length - 1;
  const cur = Math.min(index, last);
  const go = (dir: 1 | -1) => setIndex((i) => Math.max(0, Math.min(last, i + dir)));

  return (
    <div role="group" aria-roledescription="carousel" aria-label="게임팀" className="flex flex-col gap-2">
      {slides.length > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="이전 팀"
            disabled={cur === 0}
            onClick={() => go(-1)}
            className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2">
            <div aria-hidden className="flex items-center gap-1.5">
              {slides.map((s, i) => (
                <span
                  key={s.key}
                  className={cn(
                    "h-2 shrink-0 rounded-full transition-[width,opacity] motion-reduce:transition-none",
                    teamColorClass(s.colorNo),
                    i === cur ? "w-5 opacity-100" : "w-2 opacity-40",
                  )}
                />
              ))}
            </div>
            <Caption className="tabular-nums" aria-live="polite" aria-atomic="true">
              <span className="sr-only">{slides[cur].label}, </span>
              {cur + 1}/{slides.length}
            </Caption>
          </div>
          <button
            type="button"
            aria-label="다음 팀"
            disabled={cur === last}
            onClick={() => go(1)}
            className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      )}

      <div
        className="grid touch-pan-y overflow-x-clip"
        onPointerDown={(e) => {
          dragStart.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const start = dragStart.current;
          dragStart.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
          swipedAtRef.current = e.timeStamp;
          go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
        onClickCapture={(e) => {
          if (e.timeStamp - swipedAtRef.current < SWIPE_CLICK_GUARD_MS) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {slides.map((s, i) => {
          const active = i === cur;
          return (
            <div
              key={s.key}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1}/${slides.length} ${s.label}`}
              aria-hidden={active ? undefined : true}
              inert={!active || undefined}
              data-slide={i}
              data-active={active ? "true" : undefined}
              className={cn(
                "col-start-1 row-start-1 flex flex-col transition-[opacity,transform,visibility] duration-300 ease-out motion-reduce:transition-none [&>*]:flex-1",
                active
                  ? "visible translate-x-0 opacity-100"
                  : cn("invisible opacity-0", i < cur ? "-translate-x-8" : "translate-x-8"),
              )}
            >
              {s.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}
