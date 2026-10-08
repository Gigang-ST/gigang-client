"use client";

import { useEffect, useRef, useState } from "react";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { formatTrackTick, type PbTrack, type PbTrackRunner } from "@/lib/pb-class-chart";
import { formatSec } from "@/lib/pb-class-score";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { Body, Caption, Micro } from "@/components/common/typography";

import styles from "./pb-pace-track.module.css";
import { teamRingClass } from "./pb-team-color";

/**
 * 10K 예상기록 트랙 — 손으로 만지는 부분(이름표·판독줄·달리기)만 클라이언트다.
 *
 * ## 자리
 * 가로 위치는 % 라 폭이 바뀌어도 같은 그림이고, 레인·높이는 서버가 데이터로 정해 보내므로(`buildPbTrack`)
 * 하이드레이션 전후로 높이가 안 바뀐다(아래 섹션이 밀리지 않는다).
 *
 * ## 이름표
 * 나는 늘 떠 있다(맨 윗레인이라 남을 가리지 않는다). 남은 마우스를 올리거나 손가락으로 누르면 뜬다 —
 * 30명 이름이 다 떠 있으면 트랙이 아니라 명단이 된다. 누른 사람의 예상기록과 근거는 트랙 아래 판독줄이
 * 말한다(떠 있는 카드에 근거까지 실으면 옆 레인 사람들을 한 뭉텅이로 가린다).
 */

/** 레인 하나의 높이 — 32px 히트 영역 + 2px 틈 */
const LANE_H = 34;
/** 트랙 판 위아래 여백 */
const SURFACE_PAD = 3;
/** 맨 윗레인 이름표가 설 자리 */
const TAG_H = 24;

/** 문자열 → 0 … mod-1. 사람마다 고정된 박자·출발 순서를 주려고 쓴다(랜덤이면 서버·클라이언트가 갈린다) */
function hashOf(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** 이름표 정렬 — 가장자리에선 트랙 밖으로 안 나가게 안쪽으로 붙인다 */
function tagAlign(x: number): string {
  if (x < 14) return "left-0 -translate-x-4";
  if (x > 86) return "right-0 translate-x-4";
  return "left-1/2 -translate-x-1/2";
}

function Runner({
  r,
  tagShown,
  selected,
  onSelect,
  onHover,
}: {
  r: PbTrackRunner;
  tagShown: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const time = formatSec(r.sec);
  const style = {
    "--x": `${r.x}%`,
    "--delay": `${hashOf(r.memId, 7) * 45}ms`,
    "--phase": `-${hashOf(r.memId, 11) * 40}ms`,
    top: SURFACE_PAD + r.lane * LANE_H,
    height: LANE_H,
  } as CSSProperties;
  // 마우스만 hover 로 받는다 — 터치의 pointerenter 는 탭과 같이 와서 이름표가 두 번 바뀐다
  const mouse = (e: ReactPointerEvent) => e.pointerType === "mouse";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0",
        styles.rail,
        // 떠 있는 남의 이름표 > 내 이름표 > 나머지 — 지금 묻는 사람이 언제나 맨 위
        (tagShown && !r.isMe) || selected ? "z-30" : r.isMe ? "z-20" : undefined,
      )}
      style={style}
    >
      <div className="absolute left-0 top-px -translate-x-1/2">
        {tagShown && (
          <span
            aria-hidden
            className={cn(
              "absolute bottom-full mb-0.5 flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px shadow-sm",
              tagAlign(r.x),
              r.isMe ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
            )}
          >
            <Micro className="font-semibold text-inherit">{r.isMe ? "나" : r.memNm}</Micro>
            <Micro className="font-numeric tabular-nums text-inherit opacity-80">{time}</Micro>
          </span>
        )}
        <button
          type="button"
          aria-label={`${r.isMe ? "나" : r.memNm} — 예상 10K ${time} (${r.basis})`}
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(r.memId);
          }}
          onFocus={() => onSelect(r.memId)}
          onPointerEnter={(e) => mouse(e) && onHover(r.memId)}
          onPointerLeave={(e) => mouse(e) && onHover(null)}
          className="pointer-events-auto relative flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden className={cn("absolute bottom-0.5 h-1 w-4 rounded-full bg-foreground/20", styles.shadow)} />
          <span aria-hidden className={cn("relative block", styles.body)}>
            <Avatar
              src={r.avatarUrl}
              seed={r.memId}
              size="xs"
              alt=""
              className={cn(
                "ring-2",
                selected ? "ring-foreground" : r.isMe ? "ring-primary" : teamRingClass(r.colorNo),
              )}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

/** 판독줄 — 누른 사람(없으면 나)의 예상기록과 근거. 높이를 고정해 사람이 바뀌어도 아래가 안 흔들린다 */
function Readout({ runner }: { runner: PbTrackRunner | null }) {
  return (
    <div aria-live="polite" className="flex h-10 items-center gap-2 border-t border-border pt-2">
      {runner ? (
        <>
          <Avatar src={runner.avatarUrl} seed={runner.memId} size="xs" alt="" />
          <Body className="shrink-0 font-semibold">{runner.isMe ? `${runner.memNm} (나)` : runner.memNm}</Body>
          <Body className="shrink-0 font-numeric font-medium tabular-nums">{formatSec(runner.sec)}</Body>
          <Caption className="min-w-0 truncate">{runner.basis}</Caption>
        </>
      ) : (
        <Caption>얼굴을 누르면 누군지 보여요</Caption>
      )}
    </div>
  );
}

export function PbPaceTrackField({ track }: { track: PbTrack }) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const { runners, laneCnt, ticks, goal, median } = track;
  const me = runners.find((r) => r.isMe) ?? null;
  const shown = runners.find((r) => r.memId === selected) ?? me;
  // 떠 있는 남의 이름표는 한 번에 하나 — 마우스가 지나가는 사람이 우선, 아니면 누른 사람.
  // 둘을 같이 띄우면 이웃 레인 이름표끼리 포개져 둘 다 못 읽는다
  const floating = hover ?? selected;
  const select = (id: string) => {
    setSelected(id);
    setHover(null);
  };
  const surfaceH = SURFACE_PAD * 2 + laneCnt * LANE_H;

  // 달려 들어오기 — 화면 아래에서 기다리다 들어올 때 한 번. 마운트 때 이미 보이면 건드리지 않는다
  // (서버가 그린 완성 그림을 JS 가 출발선으로 되돌렸다 다시 보내면 멀쩡한 화면이 한 번 튄다).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // 화면 밖이면 조깅을 멈춘다 — 이건 계속 본다
    const idle = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) delete el.dataset.offscreen;
      else el.dataset.offscreen = "";
    });
    idle.observe(el);

    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return () => idle.disconnect();

    el.dataset.run = "pending";
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    const start = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.run = "go";
        start.disconnect();
        // 출발 지연(최대 270ms) + 달리기(1.5s) 뒤 제자리 조깅으로
        doneTimer = setTimeout(() => {
          el.dataset.run = "done";
        }, 1900);
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    start.observe(el);
    return () => {
      idle.disconnect();
      start.disconnect();
      if (doneTimer) clearTimeout(doneTimer);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* 바깥을 누르면 고른 사람을 놓는다(판독줄은 나로 돌아간다) */}
      <div
        ref={ref}
        className={cn("relative overflow-x-clip", styles.field)}
        style={{ paddingTop: TAG_H }}
        onClick={() => setSelected(null)}
      >
        <div
          role="group"
          aria-label="10K 예상기록 트랙 — 왼쪽이 느리고 오른쪽이 빨라요"
          className="relative rounded-xl bg-sport-road-run/12"
          style={{ height: surfaceH }}
        >
          {/* 레인 줄 — 실제 트랙처럼 흰 선(다크에선 바탕색 홈) */}
          {Array.from({ length: laneCnt - 1 }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute inset-x-0 h-px bg-background/80"
              style={{ top: SURFACE_PAD + (i + 1) * LANE_H }}
            />
          ))}
          <div className="absolute inset-y-0 inset-x-4">
            {ticks.map((t) => (
              <span
                key={t.sec}
                aria-hidden
                className="absolute inset-y-1 w-px bg-sport-road-run/20"
                style={{ left: `${t.x}%` }}
              />
            ))}
            {goal && (
              <span
                aria-hidden
                className="absolute inset-y-0 w-0 border-l-[1.5px] border-dashed border-primary/80"
                style={{ left: `${goal.x}%` }}
              />
            )}
            {/* 중앙값 — 판 바닥에 작은 삼각형 하나(선을 하나 더 그으면 목표선과 헷갈린다) */}
            <span
              aria-hidden
              className="absolute -bottom-1 size-0 -translate-x-1/2 border-x-[5px] border-b-[6px] border-x-transparent border-b-muted-foreground"
              style={{ left: `${median.x}%` }}
            />
            {runners.map((r) => (
              <Runner
                key={r.memId}
                r={r}
                tagShown={r.isMe || r.memId === floating}
                selected={r.memId === selected}
                onSelect={select}
                onHover={setHover}
              />
            ))}
          </div>
        </div>

        {/* 축 — 왼쪽 큰 숫자(느림)에서 오른쪽 작은 숫자(빠름)로 */}
        <div aria-hidden className="relative mx-4 mt-1.5 h-4">
          {ticks.map((t) => (
            <Micro
              key={t.sec}
              className="absolute top-0 -translate-x-1/2 font-numeric tabular-nums"
              style={{ left: `${t.x}%` }}
            >
              {formatTrackTick(t.sec)}
            </Micro>
          ))}
        </div>
      </div>

      <Readout runner={shown} />
    </div>
  );
}
