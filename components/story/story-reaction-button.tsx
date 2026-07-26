"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { bumpStoryReaction } from "@/app/actions/story/bump-reaction";
import {
  isRolledOver,
  MAX_RCTN_DELTA,
  RCTN_LABEL,
  rolledCount,
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
 *
 * 상한은 없다. 버튼 폭이 고정이라 숫자만 mod 10000으로 감아(9999 다음 0) 네 자리 안에 두고,
 * 한 바퀴라도 돈 순간(실제 누적 ≥ 10000)부터 파랑을 벗고 빨강으로 — 카운터는 계속 살아 있다는 신호.
 */
export function StoryReactionButton({
  entityType,
  entityId,
  rctnCd,
  initialCount,
  initialMyCount = 0,
  tone = "app",
  onInteract,
}: {
  entityType: StoryEntityType;
  entityId: string;
  rctnCd: RctnCd;
  /** 항목 총합 (모든 멤버 합계) */
  initialCount: number;
  /** 내가 지금까지 누른 횟수 — 눌렀나 여부(하이라이트) 판정용 */
  initialMyCount?: number;
  /** "board" — 전광판 스크린 존 안. 야간 배경이라 앰버/보드 토큰으로 갈아입는다 */
  tone?: "app" | "board";
  /**
   * 누를 때마다 부른다 — 리드가 손 밑에서 자동 전환되지 않게 리드 스와이프를 멈추기 위해.
   * 연타 내내 갱신돼야 하므로 매 탭마다 부른다(스와이프 pause와 같은 타이머를 물린다).
   */
  onInteract?: () => void;
}) {
  const [count, setCount] = useState(initialCount);
  const [myCount, setMyCount] = useState(initialMyCount);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [combo, setCombo] = useState(0);

  const pendingRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);
  const comboTimerRef = useRef<number | null>(null);
  const burstIdRef = useRef(0);
  // flush 요청 순번. 응답이 순서 역전돼 도착해도 최신 요청의 값만 반영한다.
  const flushSeqRef = useRef(0);

  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const { emoji, label } = RCTN_LABEL[rctnCd];
  // 응원은 상한이 없다. 표시만 mod 10000으로 감고, 한 바퀴라도 돌면(≥10000) 빨강으로 바뀐다.
  const shownCount = rolledCount(count);
  const rolledOver = isRolledOver(count);

  const flush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const delta = Math.min(pendingRef.current, MAX_RCTN_DELTA);
    if (delta < 1) return;
    pendingRef.current = 0;

    const seq = ++flushSeqRef.current;

    void bumpStoryReaction({ entityType, entityId, rctnCd, delta }).then(
      (result) => {
        if (result.ok) {
          // 더 나중에 보낸 요청이 이미 응답했다면(순서 역전) 오래된 값으로 덮지 않는다.
          if (seq === flushSeqRef.current) setMyCount(result.myCount);
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
    // 누르는 동안 리드가 자동 전환되면 항목이 손 밑에서 사라진다 — 매 탭마다 스와이프를 멈춘다.
    onInteract?.();

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
    // 래퍼 — 콤보 배지(×N)를 버튼 **바깥** 오른쪽에 띄우기 위한 기준(relative)이다. 콤보가
    // 버튼 안에 있으면 나타났다 사라질 때 버튼 폭이 출렁여 자리가 흔들린다. 공을 튕길 때처럼
    // 배지는 버튼 밖 허공에 떠야 버튼 크기가 고정된다.
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        aria-label={`${label} ${count}개, 누르면 하나 더`}
        className={cn(
          // 여백을 줄여(px-3/gap-1) 이모지+라벨 2자+숫자 4자리(9999)가 버튼 폭 안에 들어간다.
          // origin-bottom-right — 콤보 확대(scale-[1.04])·탭 축소(active:scale-95)가 우하단을
          // 기준으로 자란다. 응원 버튼은 어느 슬롯에서든 우하단 모서리에 붙어, 위/오른쪽으로
          // 커지면 슬롯 컨테이너의 overflow-hidden(고정 높이 세로 잘림 방지용) 경계에 배지(×N)가
          // 잘린다. 커지는 방향을 안쪽(좌·상)으로 고정해 어느 화면에서도 안 잘리게 한다.
          "relative flex origin-bottom-right items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-transform focus-visible:outline-none focus-visible:ring-2 active:scale-95",
          combo >= 3 && !reduced && "scale-[1.04]",
          // 한 바퀴 돌면(9999 넘김) 파랑을 벗고 빨강으로 — 카운터는 계속 살아 있다는 신호.
          rolledOver
            ? "border-destructive/50 bg-destructive/10 text-destructive focus-visible:ring-destructive"
            : tone === "board"
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
            {/* 표시값은 mod 10000(0~9999) — 실제 누적치는 계속 살아 있다. key로 재마운트시켜
                숫자가 아래에서 올라오게 한다. 9999 다음 탭은 0으로 보이며 색이 빨강으로 바뀐다. */}
            <span key={shownCount} className="rctn-roll block">
              {shownCount}
            </span>
          </span>
        )}
      </button>

      {/* 콤보 배지 ×N — 카운트 숫자(버튼 오른쪽 끝) **대각선 위**에 바짝 붙여 띄운다. 오른쪽
          (left-full)으로 빼면 슬롯 컨테이너의 overflow-hidden(우측 경계)에 잘리므로, 세로 잘림이
          없는 위쪽에 두되 버튼 상단선에 걸치듯 내려 숫자와 한 덩어리로 읽히게 한다. */}
      {combo >= 3 && (
        <span
          aria-hidden
          className={cn(
            "rctn-combo pointer-events-none absolute bottom-full right-0 -mb-1.5 whitespace-nowrap font-numeric text-[13px] font-bold tabular-nums",
            tone === "board" ? "text-board-amber" : "text-primary",
          )}
        >
          ×{combo}
        </span>
      )}
    </span>
  );
}
