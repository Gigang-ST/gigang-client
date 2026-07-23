"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { Avatar } from "@/components/common/avatar";

import type { StoryFeed } from "@/lib/queries/story-feed";

/** 떠다니는 아바타 최대 개수 — 너무 많으면 리드 글자를 가린다 */
const MAX_AVATARS = 7;
/** 아바타 지름(px) */
const SIZE = 32;
/** 반지름 — 구르는 회전각 계산(회전각 = 이동거리 / 반지름)에 쓴다 */
const RADIUS = SIZE / 2;
/** 구를 때의 수평 속도(px/frame). 이전(0.5)의 절반 이하로 느긋하게 */
const ROLL = 0.22;
/** 중력 가속도(px/frame²) */
const GRAVITY = 0.4;
/** 바닥 반발계수 — 튕길 때마다 수직 속도가 이만큼만 남는다 */
const BOUNCE = 0.55;
/** 벽 반발계수 — 옆벽에 부딪혀 튕길 때 수평 속도 감쇠 */
const WALL_BOUNCE = 0.6;
/** 공중 저항 — 포물선 수평 속도를 서서히 줄여 자연스럽게 안착 */
const AIR_DRAG = 0.99;
/** 클릭 시 튀어오르는 힘(위 방향 기본). 포물선을 그리도록 넉넉히 */
const POP_UP = 8.5;
/** 클릭 시 옆으로 흩는 힘의 최대치 — 누른 위치에 따라 좌우 포물선 */
const POP_SIDE = 5;
/** 이 속도 미만의 수직 튐은 바닥에 안착시킨다(무한 미세 진동 방지) */
const REST_VY = 1.4;
/** 바닥에서 구르는 상태가 유지되는 프레임 범위(랜덤) — 이 뒤엔 잠시 멈춘다 */
const ROLL_FRAMES: [number, number] = [40, 120];
/** 바닥에서 멈춰 쉬는 프레임 범위(랜덤) — 이 뒤엔 다시 구른다 */
const IDLE_FRAMES: [number, number] = [30, 100];

/** [min,max] 사이 정수 랜덤 */
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}
/** 사람마다 부여하는 링 색 — 클릭 시 누가 눌렀는지 색으로 구분(전광판 톤과 무관한 놀이 색) */
const RING_COLORS = [
  "#ff5d73", "#ffb020", "#22c55e", "#38bdf8",
  "#a855f7", "#f472b6", "#14b8a6",
];

type Person = { mem_id: string; mem_nm: string; avatar_url: string | null };

/** 물리 상태 — React state가 아니라 ref로만 들고 DOM을 직접 갱신한다(매 프레임 리렌더 방지) */
type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 누적 회전각(deg) — 구르는 것처럼 보이려 이동거리에 비례해 돈다 */
  rot: number;
  /** 공중(포물선/점프) 여부 — 바닥 상태머신은 땅에 있을 때만 돈다 */
  airborne: boolean;
  /** 바닥 상태머신: 남은 프레임. rolling이면 구르고, 아니면 멈춰 쉰다 */
  phase: number;
  rolling: boolean;
  /** 구를 방향(+1/-1) */
  dir: number;
  /** 클릭 링 이펙트 남은 프레임 */
  pop: number;
  el: HTMLButtonElement | null;
};

/** 피드 곳곳의 멤버를 모아 유니크하게 — 새얼굴·활동량·참가왕·기록·각오 순 */
function collectPeople(feed: StoryFeed): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  const push = (p: Person) => {
    if (!p.mem_id || seen.has(p.mem_id)) return;
    seen.add(p.mem_id);
    out.push(p);
  };
  feed.newbies.forEach(push);
  feed.actv_rank.forEach((e) =>
    push({ mem_id: e.mem_id, mem_nm: e.mem_nm, avatar_url: e.avatar_url }),
  );
  feed.month_rank.forEach((e) =>
    push({ mem_id: e.mem_id, mem_nm: e.mem_nm, avatar_url: e.avatar_url }),
  );
  feed.records.forEach((r) =>
    push({ mem_id: r.mem_id, mem_nm: r.mem_nm, avatar_url: r.avatar_url }),
  );
  feed.pledges.forEach((p) =>
    push({ mem_id: p.mem_id, mem_nm: p.mem_nm, avatar_url: p.avatar_url }),
  );
  return out.slice(0, MAX_AVATARS);
}

/**
 * 모션 허용 여부를 미디어쿼리 구독으로 읽는다.
 * SSR 스냅샷은 false — 서버에서는 안 그리고, 클라이언트에서 실제 값으로 확정한다.
 * 사용자가 도중에 "동작 줄이기"를 켜면 구독이 반영해 유영이 멎는다.
 */
function useAllowMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * 떠다니는 아바타 — 리드 위 투명 레이어에서 크루원 얼굴이 느리게 유영한다.
 *
 * 실시간 접속자는 아니다(가벼운 버전) — 피드에 등장하는 멤버 얼굴을 재료로, 농구공 튕기듯
 * 노는 장식이다. 탭하면 통통 튀어오르고(속도 부여), 사람마다 다른 색 링이 번져 누구를 눌렀는지
 * 보인다. 레이어는 포인터를 통과시키고(리드 스와이프를 막지 않게) 아바타만 클릭을 받는다.
 *
 * 물리 상태는 React state가 아니라 ref에 두고 rAF에서 DOM transform을 직접 갱신한다 —
 * 매 프레임 리렌더하면 7개 아바타라도 낭비다. `prefers-reduced-motion`이면 아예 렌더하지
 * 않는다(유영이 이 컴포넌트의 전부라 멈춰 세우면 남길 게 없다).
 */
export function FloatingAvatars({ feed }: { feed: StoryFeed }) {
  const people = useMemo(() => collectPeople(feed), [feed]);
  const allow = useAllowMotion();
  const wrapRef = useRef<HTMLDivElement>(null);

  // 물리 상태 배열 — people이 바뀔 때만 새로 만든다(엘리먼트는 ref 콜백이 채운다).
  // useMemo로 파생시켜 render 중 ref를 건드리지 않는다.
  const balls = useMemo<Ball[]>(
    () =>
      people.map(() => ({
        x: 0, y: 0, vx: 0, vy: 0, rot: 0,
        airborne: true, phase: 0, rolling: false, dir: 1, pop: 0, el: null,
      })),
    [people],
  );

  useEffect(() => {
    if (!allow || balls.length === 0) return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    const w = wrap.clientWidth || 320;
    const h = wrap.clientHeight || 200;

    // 위쪽 아무 데나 흩뿌린다 — 중력이 떨어뜨려 바닥에 안착시키고, 착지하면 상태머신이 돈다.
    balls.forEach((b) => {
      b.x = Math.random() * (w - SIZE);
      b.y = Math.random() * (h * 0.4);
      b.vx = 0;
      b.vy = 0;
      b.rot = Math.random() * 360;
      b.airborne = true;
      b.rolling = false;
      b.phase = randInt(...IDLE_FRAMES);
      b.dir = Math.random() < 0.5 ? -1 : 1;
    });

    let raf = 0;
    const step = () => {
      const el = wrapRef.current;
      const bw = el?.clientWidth || w;
      const bh = el?.clientHeight || h;
      const floor = bh - SIZE;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];

        if (b.airborne) {
          // 공중 — 포물선. 중력 + 공기저항, 회전은 수평 속도에 비례(구르는 잔상)
          b.vy += GRAVITY;
          b.vx *= AIR_DRAG;
        } else {
          // 바닥 — 멈췄다/굴렀다 상태머신. 구르는 동안만 수평 속도를 준다.
          b.phase -= 1;
          if (b.phase <= 0) {
            b.rolling = !b.rolling;
            if (b.rolling) {
              b.dir = Math.random() < 0.5 ? -1 : 1;
              b.phase = randInt(...ROLL_FRAMES);
            } else {
              b.phase = randInt(...IDLE_FRAMES);
            }
          }
          b.vx = b.rolling ? b.dir * ROLL : 0;
          b.vy = 0;
        }

        b.x += b.vx;
        b.y += b.vy;
        // 구르는 회전 — 이동한 거리를 반지름으로 나눈 만큼 돈다(호도→도)
        b.rot += (b.vx / RADIUS) * (180 / Math.PI);

        // 좌우 벽 — 부딪히면 튕기고 방향 반전(공중이면 감쇠, 바닥이면 dir 뒤집기)
        if (b.x <= 0) {
          b.x = 0;
          b.vx = Math.abs(b.vx) * (b.airborne ? WALL_BOUNCE : 1);
          b.dir = 1;
        }
        if (b.x >= bw - SIZE) {
          b.x = bw - SIZE;
          b.vx = -Math.abs(b.vx) * (b.airborne ? WALL_BOUNCE : 1);
          b.dir = -1;
        }

        // 천장 반사
        if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy) * BOUNCE; }

        // 바닥 — 튕기거나 안착. 안착하면 상태머신(구름/멈춤)으로 넘어간다.
        if (b.y >= floor) {
          b.y = floor;
          if (b.vy > REST_VY) {
            b.vy = -b.vy * BOUNCE; // 아직 튈 힘이 있으면 포물선 계속
          } else if (b.airborne) {
            // 착지 — 상태머신 시작
            b.vy = 0;
            b.airborne = false;
            b.rolling = false;
            b.phase = randInt(...IDLE_FRAMES);
          }
        }

        if (b.pop > 0) b.pop -= 1;
        // DOM 직접 갱신 — React 리렌더 없이. translate + rotate로 굴러가는 느낌.
        if (b.el) {
          b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.rot}deg)`;
          b.el.style.boxShadow =
            b.pop > 0 ? `0 0 0 3px ${RING_COLORS[i % RING_COLORS.length]}` : "";
        }
      }
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [allow, balls]);

  if (!allow || people.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {people.map((person, i) => (
        <button
          key={person.mem_id}
          type="button"
          tabIndex={-1}
          ref={(node) => {
            const b = balls[i];
            if (b) b.el = node;
          }}
          onClick={(e) => {
            const b = balls[i];
            if (!b) return;
            // 농구공 튕기듯 — 누른 위치의 반대편 위로 포물선을 그린다(왼쪽 누르면 오른쪽 위로).
            // 공중이든 바닥이든 매번 힘을 새로 실어 두 번, 세 번 이어 때릴 수 있다(드리블).
            const rect = e.currentTarget.getBoundingClientRect();
            const hitX = (e.clientX - rect.left) / rect.width; // 0(왼쪽)~1(오른쪽)
            b.airborne = true;
            b.vy = -POP_UP;
            b.vx = -(hitX - 0.5) * 2 * POP_SIDE; // 가운데=수직, 가장자리=옆으로 세게
            b.pop = 32;
          }}
          style={{ width: SIZE, height: SIZE, opacity: 0.5 }}
          className="pointer-events-auto absolute left-0 top-0 rounded-full transition-shadow"
        >
          <Avatar
            src={person.avatar_url}
            seed={person.mem_id}
            alt={person.mem_nm}
            size="sm"
          />
        </button>
      ))}
    </div>
  );
}
