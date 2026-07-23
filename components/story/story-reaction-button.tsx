"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { bumpStoryReaction } from "@/app/actions/story/bump-reaction";
import {
  MAX_MY_RCTN,
  MAX_RCTN_DELTA,
  RCTN_LABEL,
} from "@/lib/story-reaction";
import { cn } from "@/lib/utils";

import type { CSSProperties } from "react";
import type { RctnCd, StoryEntityType } from "@/lib/queries/story-feed";

/** 연타를 모아 한 번에 보내는 간격 */
const FLUSH_MS = 700;
/** 이 시간 안에 다시 누르면 콤보가 이어진다 */
const COMBO_MS = 1200;
/** 동시에 떠 있을 수 있는 이모지 개수 */
const MAX_BURSTS = 8;

type Burst = { id: number; dx: number; rot: number };

/**
 * 응원 버튼 — 누른 만큼 올라간다. 카카오톡 이모티콘 연타와 같은 감각.
 *
 * 1인 1회 토글이던 것을 무한 카운트로 바꿨다(취소 없음). 탭은 즉시 화면에 반영하고
 * 서버 전송은 700ms 디바운스로 모아 한 번에 보낸다 — 연타마다 왕복하면 네트워크가 터진다.
 * 이탈 시 유실을 막으려고 `pagehide`·탭 전환·언마운트에서 남은 증분을 즉시 흘려보낸다.
 *
 * 모션 3층(숫자 롤업 · 이모지 버스트 · 콤보 배지)이 "누르는 맛"을 만든다.
 * `prefers-reduced-motion`이면 롤업만 남기고 나머지는 만들지 않는다.
 */
export function StoryReactionButton({
  entityType,
  entityId,
  rctnCd,
  initialCount,
  initialMyCount = 0,
  tone = "app",
}: {
  entityType: StoryEntityType;
  entityId: string;
  rctnCd: RctnCd;
  /** 항목 총합 (모든 멤버 합계) */
  initialCount: number;
  /** 내가 지금까지 누른 횟수 — 상한 판정용 */
  initialMyCount?: number;
  /** "board" — 전광판 스크린 존 안. 야간 배경이라 앰버/보드 토큰으로 갈아입는다 */
  tone?: "app" | "board";
}) {
  const [count, setCount] = useState(initialCount);
  const [myCount, setMyCount] = useState(initialMyCount);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [combo, setCombo] = useState(0);

  const pendingRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);
  const comboTimerRef = useRef<number | null>(null);
  const burstIdRef = useRef(0);

  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const { emoji, label } = RCTN_LABEL[rctnCd];
  const maxed = myCount >= MAX_MY_RCTN;

  const flush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const delta = Math.min(pendingRef.current, MAX_RCTN_DELTA);
    if (delta < 1) return;
    pendingRef.current = 0;

    void bumpStoryReaction({ entityType, entityId, rctnCd, delta }).then(
      (result) => {
        if (result.ok) {
          setMyCount(result.myCount);
          return;
        }
        // 실패한 만큼만 되돌린다 — 그 사이 추가된 탭은 다음 flush가 책임진다.
        setCount((c) => Math.max(0, c - delta));
        setMyCount((m) => Math.max(0, m - delta));
        toast.error(result.message);
      },
    );
  }, [entityType, entityId, rctnCd]);

  // 페이지를 떠나거나 탭이 숨겨지면 남은 증분을 흘려보낸다.
  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.hidden) flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // 스포트라이트가 다음 기사로 넘어가면 이 버튼은 언마운트된다 — 여기서도 흘려보낸다.
      flush();
    };
  }, [flush]);

  useEffect(() => {
    return () => {
      if (comboTimerRef.current !== null)
        window.clearTimeout(comboTimerRef.current);
    };
  }, []);

  function handleClick() {
    if (maxed || myCount + pendingRef.current >= MAX_MY_RCTN) return;

    setCount((c) => c + 1);
    pendingRef.current += 1;

    // 콤보 — 끊기면 0으로 되돌아간다.
    setCombo((c) => c + 1);
    if (comboTimerRef.current !== null)
      window.clearTimeout(comboTimerRef.current);
    comboTimerRef.current = window.setTimeout(() => setCombo(0), COMBO_MS);

    if (!reduced) {
      const id = burstIdRef.current++;
      const burst: Burst = {
        id,
        dx: Math.round((Math.random() - 0.5) * 48),
        rot: Math.round((Math.random() - 0.5) * 60),
      };
      setBursts((prev) => [...prev, burst].slice(-MAX_BURSTS));
      window.setTimeout(
        () => setBursts((prev) => prev.filter((b) => b.id !== id)),
        700,
      );
    }

    // 디바운스가 다 차기 전이라도 한도에 닿으면 먼저 보낸다.
    if (pendingRef.current >= MAX_RCTN_DELTA) {
      flush();
      return;
    }
    if (flushTimerRef.current !== null)
      window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(flush, FLUSH_MS);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={maxed}
      aria-label={
        maxed ? `${label} ${count}개 — 더 누를 수 없습니다` : `${label} ${count}개, 누르면 하나 더`
      }
      className={cn(
        "relative flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-transform focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60",
        !maxed && "active:scale-95",
        combo >= 3 && !reduced && "scale-[1.04]",
        tone === "board"
          ? [
              "focus-visible:ring-board-amber",
              myCount > 0
                ? "border-board-amber/50 bg-board-amber/15 text-board-amber"
                : "border-board-line bg-white/5 text-board-foreground hover:bg-white/10",
            ]
          : [
              "focus-visible:ring-ring",
              myCount > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-foreground hover:bg-muted",
            ],
      )}
    >
      {/* 튀어오르는 이모지 — 버튼 위쪽 허공에 그린다 */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0">
        {bursts.map((b) => (
          <span
            key={b.id}
            className="rctn-burst absolute left-1/2 top-0 text-[15px] leading-none"
            style={
              { "--rctn-dx": `${b.dx}px`, "--rctn-rot": `${b.rot}deg` } as CSSProperties
            }
          >
            {emoji}
          </span>
        ))}
      </span>

      <span aria-hidden>{emoji}</span>
      <span>{label}</span>

      {count > 0 && (
        <span
          aria-hidden
          className="block h-[1.2em] overflow-hidden font-numeric tabular-nums"
        >
          {/* key로 재마운트시켜 숫자가 아래에서 올라오게 한다 */}
          <span key={count} className="rctn-roll block">
            {count}
          </span>
        </span>
      )}

      {combo >= 3 && (
        <span
          aria-hidden
          className={cn(
            "rctn-combo font-numeric text-[11px] tabular-nums",
            tone === "board" ? "text-board-amber" : "text-primary",
          )}
        >
          ×{combo}
        </span>
      )}
    </button>
  );
}
