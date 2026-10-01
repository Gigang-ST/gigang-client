"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { drawMemoryIndex, type RecapMemory } from "@/lib/mileage-recap";

import { RecapMemoryCard } from "./recap-memory-card";

import type { PointerEvent } from "react";

/** 자동 넘기기 간격 */
const AUTO_MS = 2000;

/**
 * 추억 넘기기 — 사진과 한마디를 한 장씩 넘겨 본다(폴라로이드 슬라이드쇼).
 *
 * 격자나 가로 스크롤로 늘어놓으면 수백 장이 "목록"이 되어 아무도 안 본다. 한 장씩 크게 넘기면
 * "다음엔 뭐가 나올까"로 계속 보게 된다. 순서는 랜덤이되 **사진 있는 장을 전부 먼저**
 * (`drawMemoryIndex`). 지나온 장은 기억해 둬서 ◀로 되돌아갈 수 있다.
 *
 * **화면에 들어오면 저절로 넘어간다(2초).** 스크롤로 지나가면 멈추고 돌아오면 다시 돈다.
 * 다만 사람이 한 번 손을 대면(넘기기·밀기·멈추기) 그 뒤로는 저절로 다시 켜지지 않는다 —
 * 보고 있는 장을 마음대로 넘기면 안 되니까. 모션을 줄인 사람에겐 처음부터 꺼 둔다.
 *
 * 첫 장·다음 장들은 서버가 뽑아 넘긴다 — 렌더 중에 랜덤을 굴리면 서버·클라가 다른 장을 그려
 * 하이드레이션이 깨진다. 이후 뽑기는 버튼·타이머 콜백 안에서만.
 * 다음 장들 사진은 미리 받아 둔다(숨긴 img) — 2초마다 넘어가서 그때 받기 시작하면 빈 칸이 뜬다.
 */
export function RecapMemories({
  memories,
  initialIndex,
  upcoming,
}: {
  memories: RecapMemory[];
  initialIndex: number;
  /** 첫 장 다음에 올 장들 — 서버가 뽑아 넘긴다 */
  upcoming: number[];
}) {
  const [history, setHistory] = useState<number[]>([initialIndex]);
  const [pos, setPos] = useState(0);
  const [queue, setQueue] = useState<number[]>(upcoming);
  const [playing, setPlaying] = useState(false);
  /** 사람이 손을 댔나 — 그 뒤로는 화면에 다시 들어와도 저절로 켜지지 않는다 */
  const touchedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const goNext = useCallback(() => {
    if (pos < history.length - 1) {
      setPos(pos + 1);
      return;
    }
    const [next, ...rest] = queue;
    if (next === undefined) return;
    const seen = new Set([...history, ...queue]);
    setHistory([...history, next]);
    setPos(pos + 1);
    setQueue([...rest, drawMemoryIndex(memories, seen)]);
  }, [history, memories, pos, queue]);

  const goPrev = useCallback(() => {
    if (pos > 0) setPos(pos - 1);
  }, [pos]);

  /** 사람이 넘기거나 멈추면 자동은 꺼지고, 다시 저절로 켜지지 않는다 */
  const takeOver = useCallback(() => {
    touchedRef.current = true;
    setPlaying(false);
  }, []);

  // 화면에 절반 넘게 들어오면 켜고, 벗어나면 멈춘다(손댄 뒤로는 켜지 않는다)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setPlaying(false);
        else if (!touchedRef.current) setPlaying(true);
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(goNext, AUTO_MS);
    return () => window.clearTimeout(timer);
  }, [playing, goNext]);

  if (memories.length === 0 || initialIndex < 0) return null;
  const memory = memories[history[pos]];
  const preload = queue
    .map((i) => memories[i]?.photo_url)
    .filter((url): url is string => !!url);

  function handlePointerUp(e: PointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(e.clientY - start.y)) return;
    takeOver();
    if (dx < 0) goNext();
    else goPrev();
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <div
        className="touch-pan-y select-none"
        onPointerDown={(e) => {
          dragStart.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
      >
        {/* key로 장이 바뀔 때마다 들어오는 모션(lede-in)을 다시 돌린다 */}
        <RecapMemoryCard key={history[pos]} memory={memory} className="lede-in" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            takeOver();
            goPrev();
          }}
          disabled={pos === 0}
          aria-label="이전 장"
          className="size-11 rounded-full"
        >
          <ChevronLeft className="size-5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (playing) {
              takeOver();
            } else {
              touchedRef.current = false;
              setPlaying(true);
            }
          }}
          aria-pressed={playing}
          className="h-11 gap-1.5 rounded-full px-4 text-[13px] text-muted-foreground"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? "멈추기" : "자동으로 넘기기"}
        </Button>

        <Button
          type="button"
          onClick={() => {
            takeOver();
            goNext();
          }}
          aria-label="다음 장"
          className="h-11 gap-1 rounded-full pl-5 pr-4"
        >
          다음
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <p className="text-center font-numeric text-[12px] text-muted-foreground tabular-nums">
        {pos + 1}번째 추억 · 옆으로 밀어도 넘어가요
      </p>

      {/* 다음 장들 미리 받기 — 화면엔 안 보인다 */}
      {preload.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" aria-hidden className="hidden" referrerPolicy="no-referrer" />
      ))}
    </div>
  );
}
