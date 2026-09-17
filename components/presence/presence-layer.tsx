"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { pickVisiblePresence } from "@/lib/presence/pick";
import { swallowNextClick } from "@/lib/presence/swallow-click";
import {
  setPresenceList,
  usePresenceDrawing,
  usePresenceList,
  type Presence,
} from "@/lib/presence/store";
import {
  ANON_PREFIX,
  PRESENCE_COLORS,
  getAnonName,
  getPresenceColorIdx,
  getPresencePersona,
  isAnonPresence,
} from "@/lib/story-presence";
import { createClient } from "@/lib/supabase/client";

import { Avatar } from "@/components/common/avatar";

/** 아바타 지름(px) */
const SIZE = 32;
/** 반지름 — 구르는 회전각 계산(회전각 = 이동거리 / 반지름)에 쓴다 */
const RADIUS = SIZE / 2;
/**
 * 히트 영역을 아바타 둘레로 넓히는 여백(px). 움직이는 32px 타깃은 손가락으로 누르기 어렵다 —
 * 둘레 12px씩 늘려 실질 히트 영역을 56px로 키운다(터치 권장 44px을 넘긴다). 아바타 크기·물리는
 * 그대로고 입력 영역만 커진다. 버튼에 얹은 뒤 음수 마진으로 상쇄해 아바타 위치는 유지한다.
 */
const HIT_PAD = 12;
/** 이름표를 놓을 아바타 아래 여유(px) — 바닥 판정은 이 띠를 뺀 높이 기준 */
const LABEL_H = 13;
/**
 * 높이를 아직 못 쟀을 때 쓰는 폴백(px) — 첫 프레임에만 스친다.
 *
 * **천장은 화면 끝이다.** 층이 탭바 위부터 화면 맨 위까지 차지하므로 실제 높이는 뷰포트가
 * 정하고, ResizeObserver가 재서 `heightRef`에 담는다(§heightRef).
 *
 * 한때 이 값이 층의 고정 높이(224px)였다 — "전력으로 튄 공 한 번이 딱 들어가는" 높이로
 * 계산한 것이다(`POP_UP²/(2·GRAVITY)` ≈ 177 + 공 32 + 이름표 13). 그 매직넘버를 없앴다:
 * 천장이 화면 끝이면 공중에 뜬 공을 **한 번 더 쳐서 계속 올려 보낼 수 있고**(224 천장에선
 * 막혀 튕겼다), 높이를 계산할 이유 자체가 사라진다.
 *
 * 층이 화면을 다 덮어도 가리는 건 없다: 배경이 없고 `pointer-events-none`이라 공 말고는
 * 아무것도 없는 투명한 층이다. 평소 공은 바닥 근처에만 붙어 있다.
 */
const FALLBACK_H = 224;

// ── 물리 상수 ──
/** 중력(px/frame²) — 낮춰서 체공을 늘린다. 연타로 이어 튕기기 쉬워진다 */
const GRAVITY = 0.26;
/** 걷는 기본 수평 속도(px/frame) — 사람별 persona.pace 배수가 곱해진다 */
const ROLL_BASE = 0.18;
/** 바닥 반발계수 */
const BOUNCE = 0.6;
/** 벽 반발계수 */
const WALL_BOUNCE = 0.6;
/** 공중 수평 저항 */
const AIR_DRAG = 0.99;
/** 클릭 시 튀는 힘(위) */
const POP_UP = 9.6;
/** 클릭 시 옆으로 흩는 힘 최대치 */
const POP_SIDE = 4.2;
/** 이 속도 미만의 수직 튐은 바닥에 안착(무한 미세 진동 방지) */
const REST_VY = 1.2;
/** 바닥에서 목표 속도로 부드럽게 붙는 정도 — 낮을수록 관성 있게 스르륵 */
const VEL_LERP = 0.055;

/**
 * 바닥 행동 — 전광판 앞을 어슬렁대는 사람들의 결.
 *
 * 이전엔 "구르기 / 멈춤" 둘뿐이라 다 같이 좌우로만 왔다갔다했다. 실제로 사람이 전시장에서
 * 노는 모습은 (1) 목적지를 정해 쭉 걸어가고 (2) 멈춰 서서 한참 구경하고 (3) 심심하면 잠깐
 * 서성이다 방향을 바꾼다. 이 셋을 나눠 두면 같은 화면에서도 사람마다 다른 리듬이 보인다.
 */
type Act = "stroll" | "watch" | "trek" | "fidget";

/** 물리 상태 — React state가 아니라 ref로만 들고 DOM을 직접 갱신한다(매 프레임 리렌더 방지) */
type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  /** 바닥에서 목표로 삼는 수평 속도 — 매 프레임 vx가 이쪽으로 스르륵 붙는다(부드러운 가감속) */
  targetVx: number;
  airborne: boolean;
  /** 현재 바닥 행동 */
  act: Act;
  /** 현재 행동의 남은 프레임 */
  phase: number;
  /** trek(장거리 산책)의 목표 x — 도착하면 행동이 끝난다 */
  goalX: number;
  /** 클릭 링 남은 프레임 */
  pop: number;
  /** 링 색 인덱스 — 사람마다 고정(mem_id 해시). 이름표·정적 배치 등 "이 사람 색"에 쓴다 */
  ringIdx: number;
  /**
   * 지금 켜진 네온 링 색 인덱스 — **맞은 사람이 아니라 누른 사람 색**이다.
   * 내가 누르면 내 색으로 빛나 "저 주황이 눌렀다"가 색으로 읽힌다. pop이 켜질 때마다 갱신된다.
   */
  popColorIdx: number;
  /**
   * 튕긴 횟수 스택 — **누른 사람 색 인덱스 → 누적 횟수**. 아바타 우측 상단에 색별 ×N 배지로 쌓인다.
   * 바닥에 안착하면 비운다("땅에 떨어지기 전까지"). 여러 명이 연타하면 색깔별로 여러 배지가 쌓인다.
   */
  hits: Map<number, number>;
  /** 사람별 성격 — 걸음 속도·멈춤 성향 */
  pace: number;
  stillness: number;
  restless: number;
  /** 구경 중 좌우로 살짝 기우뚱하는 위상 — 멈춰 있어도 죽어 보이지 않게 */
  sway: number;
};

/**
 * 브로드캐스트 메시지 — 튕김만 주고받는다(위치는 각자 화면이 알아서 굴린다).
 *
 * `by`(누른 사람 id)를 함께 싣는다 — 예전엔 안 실었다(색을 각 화면이 맞은 사람 id 해시로 알아서
 * 계산했으므로). 이제 네온·배지 색이 **누른 사람 색**이라, 받는 쪽이 "누가 눌렀는지"를 알아야
 * 같은 색을 계산할 수 있다. 색 문자열이 아니라 id만 실어 보내면 팔레트를 바꿔도 포맷이 안 바뀐다.
 */
type BumpMsg = { mem_id: string; hitX: number; by: string };

/** 탭 하이라이트 지속 프레임 — 이 값에서 0으로 줄며 네온이 서서히 꺼진다(60fps 기준 약 1초) */
const POP_MAX = 60;

/** `#rrggbb` → `r,g,b` 문자열. 네온 glow에 알파를 넣으려면 rgba가 필요하다(hex는 알파 표현이 번거롭다) */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16,
  );
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/**
 * 탭했을 때 아바타에 두르는 **실선 링** — 색으로 "누가 쳤나"를 말한다.
 *
 * 예전엔 링 바깥에 blur 겹(5·9·17·27·42px)을 쌓아 네온처럼 번지게 했다. 그걸 걷어낸 이유는
 * 이 하늘이 **흰 지면 위**이기 때문이다 — glow는 어두운 판에서만 발광으로 읽히고(§DESIGN
 * board 토큰), 밝은 배경에서는 빛이 아니라 아바타 둘레가 뿌옇게 번진 얼룩으로 보인다.
 * 게다가 아바타는 매 프레임 움직이는데 번짐이 따라다니면 잔상처럼 지저분해진다.
 *
 * 지금은 링 하나만 남긴다. 색은 `mem_id` 해시로 사람마다 고정이라(§lib/story-presence),
 * 번짐 없이도 "저 초록이 준민"이 읽힌다 — 정보는 색이 나르고 굵기는 세기만 나른다.
 *
 * 두께는 **4px**다. glow가 있을 땐 번짐이 존재감을 대신 내줘서 1.5px로도 보였지만, 링만
 * 남기고 나니 그 두께로는 32px 아바타(size="sm") 둘레에서 눈에 안 걸린다. 아바타 반지름의
 * 1/4쯤 돼야 "테두리가 켜졌다"가 한눈에 읽힌다.
 *
 * `pop`(POP_MAX→0)으로 **굵기와 알파를 함께** 줄인다: 튕긴 순간 가장 굵고 1초에 걸쳐
 * 가늘어지며 사라진다. 예전엔 두께를 고정하고 glow만 껐는데, 그러면 빛이 꺼진 뒤에도 실선이
 * 남아 "아직 눌린 상태인가" 싶었다.
 */
const RING_PX = 4;

function neonRing(ringIdx: number, pop: number): string {
  const rgb = hexToRgb(PRESENCE_COLORS[ringIdx % PRESENCE_COLORS.length]);
  const t = Math.max(0, Math.min(1, pop / POP_MAX)); // 1=방금 눌림, 0=꺼짐
  // 알파는 t를 살짝 완만하게(제곱근) — 후반부에 너무 급히 꺼지지 않게
  const a = Math.sqrt(t);
  // 굵기도 같이 페이드한다(RING_PX → 0). 소수 두 자리까지 남겨 계단지지 않게.
  const w = (RING_PX * a).toFixed(2);
  return `0 0 0 ${w}px rgba(${rgb},${a.toFixed(2)})`;
}

/** [min,max) 정수 랜덤 */
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

/**
 * 튕김 배지 스택을 DOM에 직접 그린다 — 누른 사람 색별 `×N`이 아바타 우측 상단에 위로 쌓인다.
 *
 * React state가 아니라 DOM을 직접 만지는 이유: 물리와 같은 rAF 루프에서 매 프레임 갱신하므로
 * (공과 함께 움직이고 튕길 때마다 즉시 반영), state로 올리면 프레임마다 리렌더가 돈다. 아바타
 * 위치·회전·네온과 똑같은 방식이다.
 *
 * 색이 **사람에게 고정**이라 배지 순서도 색 인덱스로 정렬해 둔다 — 매 프레임 Map 순회 순서가
 * 흔들려 배지가 아래위로 튀지 않게(먼저 친 사람이 아래에 남아 "쌓인" 느낌이 유지된다).
 * DOM 노드는 재사용하고 개수만 맞춘다(매 프레임 innerHTML 재생성은 낭비).
 */
function renderHitBadges(host: HTMLElement, hits: Map<number, number>): void {
  // **평상시 경로를 먼저 끊는다.** 아무도 안 누르고 있으면 `hits`는 비어 있고 배지 DOM도
  // 이미 없다 — 그게 거의 모든 프레임이다. 그냥 통과시키면 공마다 매 프레임 `Array.from` +
  // `sort`로 쓰레기를 만든다(12명이면 초당 720개). 일이 없을 땐 아무것도 안 하고 나간다.
  if (hits.size === 0 && host.childElementCount === 0) return;

  const entries = Array.from(hits.entries()).sort((a, b) => a[0] - b[0]);
  // 개수 맞추기 — 남으면 지우고, 모자라면 만든다
  while (host.childElementCount > entries.length) {
    host.lastElementChild?.remove();
  }
  while (host.childElementCount < entries.length) {
    const chip = document.createElement("span");
    // 배경 없이 **글씨 자체가 색**인 ×N. 배경 위에서도 읽히게 얇은 외곽선(textShadow)만 깐다.
    chip.className = "font-numeric text-[10px] font-bold leading-[14px]";
    chip.style.textShadow =
      "0 0 2px var(--background), 0 0 2px var(--background), 0 0 3px var(--background)";
    host.appendChild(chip);
  }
  entries.forEach(([idx, count], i) => {
    const chip = host.children[i] as HTMLElement;
    chip.style.color = PRESENCE_COLORS[idx % PRESENCE_COLORS.length];
    chip.textContent = `×${count}`;
  });
}

/**
 * 모든 공의 **현재 좌표를 DOM에 반영**한다 — 물리를 진행시키지 않고 위치만 찍는다.
 *
 * transform을 찍는 곳은 원래 rAF 루프뿐이라, 루프가 멈춰 있는 동안(하늘이 화면 밖) 새로
 * 등장한 얼굴은 버튼 CSS의 `left-0 top-0` 그대로 **좌상단에 붙박인 채** 남는다. 루프 밖에서
 * "지금 상태를 화면에 맞추는" 용도로 쓴다(새 얼굴 등장 직후, 루프 재시작 직후).
 *
 * 물리 계산과 분리해 둬야 이 호출이 공을 한 프레임 앞당기는 부작용이 없다. 네온 링
 * (boxShadow)은 건드리지 않는다 — 그건 `pop`이 매 프레임 줄어드는 값이라 루프의 것이다.
 */
function syncTransforms(
  balls: Map<string, Ball>,
  els: Map<string, HTMLButtonElement | null>,
): void {
  for (const [memId, b] of balls) {
    const node = els.get(memId);
    if (!node) continue;
    node.style.transform = `translate(${b.x}px, ${b.y}px)`;
    const face = node.firstElementChild as HTMLElement | null;
    if (face) face.style.transform = `rotate(${b.rot}deg)`;
  }
}

/**
 * 다음 바닥 행동을 뽑는다 — 사람별 성격(stillness/pace/restless)이 확률과 길이를 흔든다.
 *
 * 행동을 여기 한 함수에 모아 둔 이유: 루프 안에 인라인으로 흩어 두면 "왜 얘는 안 움직이지"를
 * 디버깅할 때 물리 계산과 뒤섞여 읽히지 않는다.
 */
function pickAct(b: Ball, bw: number) {
  const r = Math.random();
  const walkable = bw - SIZE;

  if (r < b.stillness) {
    // 구경 — 전광판 앞에 멈춰 선다. 성격에 따라 잠깐(2초)부터 한참(8초)까지.
    b.act = "watch";
    b.targetVx = 0;
    b.phase = Math.round(randInt(120, 480) * b.restless);
    return;
  }
  if (r < b.stillness + 0.16) {
    // 서성임 — 제자리에서 짧게 좌우로. 방향을 자주 바꿔 "심심한" 느낌을 준다.
    b.act = "fidget";
    b.targetVx = (Math.random() < 0.5 ? -1 : 1) * ROLL_BASE * b.pace * 0.35;
    b.phase = randInt(18, 45);
    return;
  }
  if (r < b.stillness + 0.16 + 0.22) {
    // 장거리 산책 — 화면 반대편 어딘가를 목적지로 잡고 쭉 걸어간다. 이게 "쭉 가는 사람".
    const goal = Math.random() * walkable;
    // 너무 가까운 목적지는 산책이 아니라 서성임이 된다 — 최소 화면 1/3은 가게
    b.goalX = Math.abs(goal - b.x) < walkable * 0.33 ? walkable - b.x : goal;
    b.act = "trek";
    b.targetVx =
      Math.sign(b.goalX - b.x) * ROLL_BASE * b.pace * (1.4 + Math.random() * 1.2);
    // 도착 판정이 주도하되, 벽에 끼는 등 이상 상황을 대비해 상한을 둔다
    b.phase = 900;
    return;
  }
  // 어슬렁 — 목적 없이 느린 걸음. 기본값.
  b.act = "stroll";
  b.targetVx =
    (Math.random() < 0.5 ? -1 : 1) * ROLL_BASE * b.pace * (0.4 + Math.random() * 1.0);
  b.phase = randInt(60, 220);
}

/**
 * 모션 허용 여부를 미디어쿼리 구독으로 읽는다(SSR 스냅샷은 false).
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
 * 전역 접속자 레이어 — **지금 앱을 같이 보고 있는 크루원**이 하단 탭바 위를 걸어다닌다.
 *
 * 피드에 등장한 얼굴이 아니라 **실시간 접속자**다(Supabase Realtime presence). 로그인 사용자가
 * 앱을 열면 자기 얼굴을 올리고(track), 닫으면 사라진다. 비로그인도 이 층을 보지만 자기
 * 아바타는 없다 — "지금 누가 같이 있나"를 얼굴로 전한다.
 *
 * ## 채널은 루트에 한 번, 그리기는 화면마다
 *
 * 예전엔 전광판(`/story`) 리드 위에서만 유영했고 채널도 그 컴포넌트가 들고 있었다. 전역으로
 * 올리면서 **채널 소유와 그리기를 분리**했다(§`lib/presence/store.ts`).
 *
 * - **채널은 루트 레이아웃에 한 번 붙는다.** 앱을 켜면 join, 닫으면 leave. 페이지를 옮겨도
 *   안 끊긴다. 페이지마다 붙였다 떼면 presence join/leave가 **접속 중인 전원에게** sync를
 *   쏘는데, 받는 쪽마다 상태를 다시 계산하고 목록을 리렌더한다 — 비용이 내 기기가 아니라
 *   남의 기기에서 인원수만큼 불어난다. 더 나쁜 건 눈에 보이는 결함이다: 내가 설정에 잠깐
 *   들어갔다 나올 때마다 **남들 화면에서 내 공이 사라졌다 새로 떨어진다.**
 * - **공은 탭바가 있는 화면에서만 그린다**(`usePresenceDrawing`). `(info)`·`(protected)`엔
 *   탭바가 없어 바닥이 안전영역까지 내려가는데 거기가 **폼 제출 버튼이 사는 자리**다.
 *   탭바가 있는 화면에선 탭바 자체가 방패라 그 충돌이 없다.
 *
 * 그래서 이 컴포넌트는 **언마운트되지 않는다** — 안 그리는 화면에서도 마운트된 채 채널만
 * 유지하고 렌더와 rAF 루프를 건너뛴다. 덕분에 공 좌표(`ballsRef`)가 살아 있어, 탭바 있는
 * 화면으로 돌아오면 다들 아까 걷던 자리 그대로다(위에서 새로 떨어지지 않는다).
 *
 * ## 층 순서
 *
 * `z-40` — 탭바·FAB·다이얼로그(`z-50`) **아래**다. 공이 FAB 뒤로 지나가고 탭은 FAB이 받는다.
 * 이게 없으면 굴러다니는 32px 원이 버튼을 가려 "눌러도 안 눌리는" 화면이 된다.
 *
 * 탭하면 그 아바타가 통통 튀는데, **이 튕김은 broadcast로 모두에게 전해진다**(같은 mem_id에
 * 같은 임펄스가 실린다). 그래서 서로 같은 공을 주고받고, 남이 튕기는 걸 방해할 수도 있다.
 * 물리 계산은 각자 화면이 돌리므로 **위치는 사람마다 조금 다르고, 맞추지 않는다**. 예전엔 안착할 때
 * 주인이 좌표를 흘려보내 재정렬했는데, 튕기고 내려앉는 순간마다 공이 순간이동해 오히려 거슬렸다.
 * 눈에 보이는 자리를 누르면 그게 그 공이라 조금 어긋나도 노는 데 지장이 없다.
 *
 * **색은 사람에게 고정**된다(`lib/story-presence.ts` — mem_id 해시). 링 색과 이름표 색이 같은
 * 색이라 "저 초록이 준민"이 학습되고, 남이 내 공을 튕겨도 누가 튕겼는지가 색으로 읽힌다.
 * 랜덤 색이면 같은 사람이 매번 다른 색으로 나와 아무 정보도 안 남는다.
 *
 * 걸음도 사람마다 다르다(persona): 목적지를 잡고 쭉 걷는 사람(trek), 한참 멈춰 구경하는
 * 사람(watch), 제자리에서 서성이는 사람(fidget), 목적 없이 어슬렁대는 사람(stroll)이 섞인다.
 *
 * 물리 상태는 ref(Map)에 두고 rAF에서 DOM transform을 직접 갱신한다 — **매 프레임 리렌더가
 * 없다.** `prefers-reduced-motion`이면 아무것도 그리지 않는다: 예전엔 유영 대신 얼굴을 정적으로
 * 늘어놓았는데, 그건 전광판 한 지면에서나 성립하는 처리였다. 모든 화면 하단에 상시로 얼굴 줄이
 * 깔리면 그건 장식이 아니라 방해다.
 *
 * 접속자 수는 여기서 안 그린다 — 전광판의 `지금 보는 중 N명`이 store에서 읽어 그린다
 * (§`components/story/presence-count.tsx`). 인원수 카운터가 모든 화면에 상주할 이유가 없다.
 */
export function PresenceLayer({
  teamId,
  me,
}: {
  teamId: string;
  /** 로그인 사용자 — presence에 등록할 내 얼굴. 비로그인이면 null(구경만) */
  me: { id: string; name: string; avatarUrl: string | null } | null;
}) {
  const allow = useAllowMotion();
  /**
   * 층 엘리먼트 — **ref가 아니라 state로 들고 있다.**
   *
   * 치수를 재려면 "이 노드가 생겼을 때" effect가 돌아야 하는데, ref는 값이 바뀌어도 리렌더도
   * effect 재실행도 안 시킨다. 실제로 그것 때문에 한 번 깨졌다: 옵저버를 `[drawing]` 의존으로
   * 걸었더니, `drawing`이 켜진 순간 아직 명단이 비어 `null`을 반환하는 동안엔 노드가 없어
   * early return하고 — 그 뒤 명단이 도착해 노드가 생겨도 **deps가 안 바뀌어 다시 안 돌았다.**
   * 높이를 영영 못 재 폴백에 머물렀고, 천장을 화면 끝으로 연 뒤엔 그 폴백 좌표가 화면 상단이라
   * **공이 공중에 떠 있었다.**
   *
   * 콜백 ref를 state에 넣으면 노드가 생기고 사라질 때 정확히 그때 effect가 돈다.
   */
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);

  /** 현재 접속자 목록 — 채널이 store에 쓰고 여기서 되읽는다 */
  const presence = usePresenceList();
  /** 지금 화면이 공을 그리는 화면인가(탭바 있음) */
  const drawing = usePresenceDrawing();

  /** 물리 상태 — mem_id → Ball */
  const ballsRef = useRef<Map<string, Ball>>(new Map());
  /** DOM 엘리먼트 — mem_id → button. ref 콜백이 채운다(렌더 중 Math.random 금지라 ball 생성과 분리) */
  const elsRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  /** broadcast 전송용 채널 핸들 */
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );
  // 채널 effect는 **원시값**에만 의존해야 한다. `me`는 서버가 매 렌더 새로 만드는 객체 리터럴
  // (page.tsx의 `me={{ id, name, avatarUrl }}`)이라, deps에 객체를 그대로 두면 각오 Realtime이
  // 부른 router.refresh() 한 번에도 참조가 바뀌어 **채널이 통째로 재구독**된다 — 접속자 얼굴이
  // 깜빡 사라졌다 나타나고 공 위치·물리가 매번 초기화된다.
  const meId = me?.id ?? null;
  const meNm = me?.name ?? null;
  const meAvatar = me?.avatarUrl ?? null;

  // 비로그인도 하늘에 얼굴을 올린다 — 단 정체 대신 익명 이름("새벽의 페이서")과 유령 얼굴로.
  // 익명 id는 **한 세션 내내 고정**이라야 색·이름·위치가 유지된다(재구독돼도 같은 얼굴).
  // sessionStorage에 담아 탭을 유지하는 동안 같은 id를 쓰고, 새 탭·새 세션이면 새 id가 뜬다.
  //
  // **서버 프리렌더에선 빈 값, 브라우저에서만 만든다.** App Router는 클라이언트 컴포넌트도
  // 서버에서 한 번 렌더하는데, 거기서 sessionStorage·Math.random을 만지면 서버에서 버려질 id를
  // 매번 만들고 React Doctor도 렌더 중 브라우저 전역 접근을 에러로 잡는다. `typeof window`로
  // 서버를 걸러 lazy initializer 안에서만 만진다 — 초기화 함수는 첫 마운트에 한 번만 도므로
  // 이 가드를 통과하면 브라우저에서 실행이 보장된다(비순수 호출도 초기화 함수에선 허용).
  // 서버 렌더의 빈 anonId는 화면에 드러날 틈이 없다 — 첫 렌더엔 presence가 비어 null을
  // 반환하고(아래), 로그인 사용자는 meId를 쓰므로 애초에 anonId가 필요 없다.
  const [anonId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem("story-anon-id");
    } catch {
      // 프라이빗 모드 등 sessionStorage 불가 — 그냥 새로 만든다
    }
    if (!stored) {
      stored = `${ANON_PREFIX}${Math.random().toString(36).slice(2, 8)}`;
      try {
        sessionStorage.setItem("story-anon-id", stored);
      } catch {
        /* 저장 실패해도 이 세션 동안 state로는 유지된다 */
      }
    }
    return stored;
  });

  // 실제 track에 쓸 정체 — 로그인이면 멤버, 아니면 익명. 이름·아바타도 여기서 갈린다.
  const presenceId = meId ?? anonId;
  const presenceNm = meId ? (meNm ?? "") : getAnonName(anonId);
  const presenceAvatar = meId ? meAvatar : null; // 익명은 아바타 없음 → 유령 얼굴로 폴백

  // 튕김 적용 — `by`는 누른 사람 id(네온·배지 색의 소스). 튕긴 공(`memId`)이 아니라 누른 쪽 색이다.
  const applyBump = (memId: string, hitX: number, by: string) => {
    const b = ballsRef.current.get(memId);
    if (!b) return;
    b.airborne = true;
    b.vy = -POP_UP;
    b.vx = -(hitX - 0.5) * 2 * POP_SIDE; // 가운데=수직, 가장자리=옆으로
    b.pop = POP_MAX;
    // 네온 색 = 누른 사람 색. 여러 명이 번갈아 치면 마지막에 친 사람 색으로 링이 바뀐다.
    const byIdx = getPresenceColorIdx(by);
    b.popColorIdx = byIdx;
    // 배지 스택 — 누른 사람 색별로 +1. 착지 전까지 쌓인다.
    b.hits.set(byIdx, (b.hits.get(byIdx) ?? 0) + 1);
  };

  // ── Realtime presence + broadcast 채널 ──
  useEffect(() => {
    // 익명 사용자는 마운트 effect가 anonId를 채우기 전 첫 렌더에 presenceId가 빈 문자열이다.
    // 그때는 구독하지 않는다 — anonId가 채워지면 이 effect가 다시 돌아 실제 키로 구독한다.
    if (!presenceId) return;

    const supabase = createClient();
    const channel = supabase.channel(`story-avatars:${teamId}`, {
      config: { presence: { key: presenceId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Presence>();
        // presence key = mem_id라 키마다 한 항목. 표시정보는 track payload에서 온다.
        const list: Presence[] = [];
        for (const key of Object.keys(state)) {
          const meta = state[key]?.[0];
          if (meta?.mem_id) {
            list.push({
              mem_id: meta.mem_id,
              mem_nm: meta.mem_nm,
              avatar_url: meta.avatar_url ?? null,
            });
          }
        }
        setPresenceList(list);
      })
      .on("broadcast", { event: "bump" }, ({ payload }) => {
        const p = payload as BumpMsg;
        applyBump(p.mem_id, p.hitX, p.by);
      })
      .subscribe((status) => {
        // 로그인이든 익명이든 자기 얼굴을 올린다(track). 익명은 유령 얼굴 + 익명 이름으로 뜬다.
        // 여기 닿을 땐 presenceId가 이미 채워져 있다(빈 값이면 위에서 구독 자체를 건너뛴다).
        if (status === "SUBSCRIBED") {
          void channel.track({
            mem_id: presenceId,
            mem_nm: presenceNm,
            avatar_url: presenceAvatar,
          });
        }
      });

    return () => {
      channelRef.current = null;
      // 명단을 비운다 — 안 비우면 정체가 바뀌어 재구독하는 동안 옛 얼굴이 남는다.
      setPresenceList([]);
      void supabase.removeChannel(channel);
    };
  }, [teamId, presenceId, presenceNm, presenceAvatar]);

  /**
   * 띠의 폭 — **매 프레임 읽지 않고 캐시한다.**
   *
   * 예전엔 루프 안에서 `clientWidth/clientHeight`를 프레임마다 읽었다. 그 읽기는 브라우저에
   * **레이아웃 플러시를 강제**한다(스타일을 쓰기 전에 읽으므로 thrashing은 아니지만, 매
   * 프레임 강제되는 건 그대로다). 폭이 바뀌는 건 창 크기·셸 폭 설정이 바뀔 때뿐이라
   * ResizeObserver로 받아 두면 루프는 순수 계산만 남는다.
   *
   * 높이도 같이 받는다 — 천장이 화면 끝이라 뷰포트에 따라 달라진다(주소창이 접히거나
   * 기기를 돌리면 바뀐다). 둘 다 **여기서 한 번씩** 받아 두면 루프는 순수 계산만 남는다.
   *
   * 초기값은 레이아웃 확정 전 첫 프레임용 폴백이다. `clientWidth/Height`가 0일 때
   * `?? 폴백`이 안 먹는 함정(`0 ?? x`는 0)을 피하려고 양수일 때만 받아 적는다 — 0이 들어가면
   * floor·벽 계산이 음수가 되어 공이 등장하자마자 구석에 박힌다.
   */
  const widthRef = useRef(320);
  const heightRef = useRef(FALLBACK_H);
  useEffect(() => {
    if (!wrapEl) return;
    const read = () => {
      const w = wrapEl.clientWidth;
      const h = wrapEl.clientHeight;
      if (w > 0) widthRef.current = w;
      // 바닥은 이 높이에서 역산한다. 화면이 커지면 floor가 내려가는데, 루프가
      // "바닥에 있어야 할 공이 floor보다 위로 뜨면 다시 떨어뜨린다"를 이미 처리한다.
      if (h > SIZE + LABEL_H) heightRef.current = h;
    };
    read();
    const obs = new ResizeObserver(read);
    obs.observe(wrapEl);
    return () => obs.disconnect();
    // **노드 자체가 deps다** — 생길 때 붙고 사라질 때 떨어진다(§wrapEl).
  }, [wrapEl]);

  // ── 접속 목록 → 공(Ball) 맞춤: 새 얼굴은 위에서 떨어지며 등장, 나간 얼굴은 제거 ──
  // Math.random은 effect 안에서만(렌더/ref콜백에서 금지 — react-hooks/purity).
  useEffect(() => {
    const ids = new Set(presence.map((p) => p.mem_id));
    presence.forEach((p) => {
      if (ballsRef.current.has(p.mem_id)) return;
      const w = widthRef.current;
      const h = heightRef.current;
      const persona = getPresencePersona(p.mem_id);
      ballsRef.current.set(p.mem_id, {
        x: Math.random() * (w - SIZE),
        y: Math.random() * (h * 0.3),
        vx: 0,
        vy: 0,
        rot: Math.random() * 360,
        targetVx: 0,
        airborne: true, // 떨어져 안착하며 등장
        act: "stroll",
        phase: randInt(30, 120),
        goalX: 0,
        pop: 0,
        // 색은 랜덤이 아니라 사람에게 고정 — 누가 치는지 색으로 알아보게
        ringIdx: getPresenceColorIdx(p.mem_id),
        // 아직 안 눌림 — 첫 튕김 때 누른 사람 색으로 세팅된다(자기 색으로 초기화만 해 둔다)
        popColorIdx: getPresenceColorIdx(p.mem_id),
        hits: new Map(),
        pace: persona.pace,
        stillness: persona.stillness,
        restless: persona.restless,
        sway: Math.random() * Math.PI * 2,
      });
    });
    for (const key of Array.from(ballsRef.current.keys())) {
      if (!ids.has(key)) {
        ballsRef.current.delete(key);
        elsRef.current.delete(key);
      }
    }
    // 초기 좌표를 DOM에 **즉시 한 번** 찍는다. transform을 찍는 곳이 rAF 루프뿐이라,
    // 루프가 멈춘 동안(화면 밖) 들어온 새 얼굴은 버튼 CSS의 `left-0 top-0` 그대로
    // 좌상단에 그려진 채 남는다. 루프가 도는 중이면 다음 프레임에 덮어쓰므로 무해하고,
    // 멈춰 있을 때만 제자리를 잡아 준다.
    syncTransforms(ballsRef.current, elsRef.current);
  }, [presence]);

  /**
   * **`IntersectionObserver`는 버렸다.**
   *
   * 전광판 리드 위 밴드였던 시절엔 "지면을 내리면 화면 밖"이라는 상태가 있어서, 그때 루프를
   * 멈추려고 옵저버를 붙였다. 고정 레이어는 **항상 화면에 있으므로 관찰할 대상 자체가 없다.**
   * 옵저버가 `return null` 타이밍에 안 붙어 아바타가 좌상단에 붙박이던 함정(`hasPresence`
   * deps 우회)도 같이 사라졌다.
   *
   * "안 보일 땐 안 움직인다"는 형태를 바꿔 남아 있다 — 스크롤 위치가 아니라 **이 화면이 공을
   * 그리는 화면인가**(`drawing`)로 판정한다. 관찰이 없어 더 싸고 판정도 명확하다.
   */

  // ── 애니메이션 루프 ──
  useEffect(() => {
    if (!allow || !drawing) return;
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      // 프레임 수가 아니라 **경과 시간**으로 움직인다. 안 그러면 화면 주사율이 그대로 속도가 돼
      // 144Hz 데스크톱은 2배 빠르고, 저전력 모드로 30Hz까지 떨어진 아이폰은 절반으로 느려진다.
      // d = 60fps 기준 배율(60Hz면 1). 상한 3은 탭을 다시 켰을 때 순간이동을 막는 안전장치.
      const d = last ? Math.min((now - last) / 16.667, 3) : 1;
      last = now;

      // 치수는 **여기서 읽지 않는다** — ResizeObserver가 채워 둔 캐시를 쓴다(§widthRef).
      // 프레임마다 clientWidth를 읽으면 그때마다 레이아웃 플러시가 강제된다. 높이는 상수라
      // 측정할 것도 없다.
      const bw = widthRef.current;
      // 이름표가 잘리지 않을 만큼만 올린다 — 공은 이 선 위에 선다.
      const floor = heightRef.current - SIZE - LABEL_H;

      for (const [memId, b] of ballsRef.current) {
        // 바닥 상태(air=false)는 "지금 y가 floor다"를 전제로 좌우로만 걷는다. 그런데 floor가
        // **커지면**(탭을 백그라운드에 뒀다 오면 rAF가 멈춘 사이 컨테이너가 리사이즈돼 bh가
        // 바뀐다) 공은 옛 floor에 붙박인 채 화면 중간에서 걸어다닌다 — vy=0으로 고정돼 새
        // floor까지 내려올 길이 없기 때문. 바닥에 있어야 할 공이 floor보다 위로 뜨면 다시
        // 떨어뜨린다(이것이 "다른 탭 갔다 오면 가운데 있다"의 원인).
        if (!b.airborne && b.y < floor - 1) {
          b.airborne = true;
        }


        if (b.airborne) {
          b.vy += GRAVITY * d;
          // 감쇠는 매 프레임 곱해지므로 배율이 아니라 지수로 보정해야 한다
          b.vx *= Math.pow(AIR_DRAG, d);
        } else {
          // 바닥 상태머신 — 행동이 끝나면 성격에 맞춰 다음 행동을 새로 뽑는다.
          // phase도 프레임 카운터라 d를 빼야 행동 길이가 기기마다 같아진다.
          b.phase -= d;
          // trek은 목적지 도착으로 끝난다(남은 거리가 한 걸음보다 짧으면 도착)
          const arrived =
            b.act === "trek" && Math.abs(b.goalX - b.x) < Math.abs(b.vx * d) + 1.5;
          if (b.phase <= 0 || arrived) pickAct(b, bw);

          if (b.act === "watch") {
            // 멈춰 구경 — 완전 정지는 죽어 보인다. 아주 느리게 좌우로 기우뚱(무게중심 이동).
            b.sway += 0.02 * d;
            b.targetVx = Math.sin(b.sway) * 0.05;
          }

          // 목표 속도로 스르륵 붙는다(부드러운 가감속). 급정지·급출발이 없어 기계느낌이 사라진다.
          // lerp 계수도 감쇠라 지수 보정 — 1에서 남은 거리가 d제곱으로 줄어드는 형태.
          b.vx += (b.targetVx - b.vx) * (1 - Math.pow(1 - VEL_LERP, d));
          b.vy = 0;
        }

        b.x += b.vx * d;
        b.y += b.vy * d;
        b.rot += ((b.vx * d) / RADIUS) * (180 / Math.PI);

        // 좌우 벽
        if (b.x <= 0) {
          b.x = 0;
          b.vx = Math.abs(b.vx) * (b.airborne ? WALL_BOUNCE : 1);
          b.targetVx = Math.abs(b.targetVx);
          // 벽에 닿으면 목적지가 벽 너머라는 뜻 — 산책을 접고 새 행동을 뽑는다(벽에 끼임 방지)
          if (!b.airborne && b.act === "trek") pickAct(b, bw);
        }
        if (b.x >= bw - SIZE) {
          b.x = bw - SIZE;
          b.vx = -Math.abs(b.vx) * (b.airborne ? WALL_BOUNCE : 1);
          b.targetVx = -Math.abs(b.targetVx);
          if (!b.airborne && b.act === "trek") pickAct(b, bw);
        }

        // 천장
        if (b.y <= 0) {
          b.y = 0;
          b.vy = Math.abs(b.vy) * BOUNCE;
        }

        // 바닥 — 튕기거나 안착
        if (b.y >= floor) {
          b.y = floor;
          // 바닥에 **닿는 순간** 튕김 스택을 비운다 — 튕겨 다시 올라가든(bounce) 멈추든 상관없이.
          // 완전히 멈출 때(airborne=false)까지 기다리면, 바닥에 닿고도 몇 번 더 튕기는 동안
          // 카운트가 남아 "땅에 닿았는데 안 지워진다"로 보인다.
          if (b.hits.size > 0) b.hits.clear();
          if (b.vy > REST_VY) {
            b.vy = -b.vy * BOUNCE;
          } else if (b.airborne) {
            // 착지 — 상태머신 시작.
            //
            // **`vy > 0` 가드가 없으면 "안 떨어지는" 버그가 난다**: 등장 직후 vy는 0인데,
            // 컨테이너 높이가 렌더 타이밍에 따라 짧게 잡히면(폰트 로딩·리드 레이아웃 전에
            // 루프가 먼저 돌면 bh가 실제보다 작다) floor가 초기 y보다 낮아진다. 그러면
            // 첫 프레임에 y >= floor가 참인데 vy=0이라 튕김도 안 하고 곧바로 착지해버려,
            // 중력이 붙기도 전에 airborne=false가 된다 — 아바타가 시작 위치에 붙박인다.
            // vy가 실제로 아래로 향할 때만(=진짜 떨어져 내려온 것) 착지로 인정한다.
            if (b.vy > 0) {
              b.vy = 0;
              b.airborne = false;
              // 착지 직후엔 잠깐 얼떨떨하게 멈췄다가 움직인다(착지=즉시 질주는 어색하다)
              b.act = "watch";
              b.targetVx = 0;
              b.phase = randInt(25, 70);
            }
          }
        }

        // 탭 하이라이트 지속시간도 프레임 카운터 — 기기마다 같은 시간 켜져 있게
        if (b.pop > 0) b.pop -= d;

        const node = elsRef.current.get(memId);
        if (node) {
          // 아바타만 굴리고 이름표는 안 돌린다 — 회전은 안쪽 래퍼에서 처리(아래 렌더 참고)
          node.style.transform = `translate(${b.x}px, ${b.y}px)`;
          const face = node.firstElementChild as HTMLElement | null;
          if (face) {
            face.style.transform = `rotate(${b.rot}deg)`;
            // 네온 색은 **누른 사람 색**(popColorIdx) — 맞은 사람 자기 색이 아니다
            face.style.boxShadow = b.pop > 0 ? neonRing(b.popColorIdx, b.pop) : "";
          }
          // 튕김 배지 스택 — 얼굴 다음 형제(두 번째 자식). 색별 ×N을 위로 쌓는다.
          const badges = node.children[1] as HTMLElement | null;
          if (badges) renderHitBadges(badges, b.hits);
        }
      }
      raf = window.requestAnimationFrame(step);
    };
    // 루프를 다시 걸기 전에 현재 좌표를 한 번 찍는다.
    //
    // **탭바 있는 화면으로 돌아온 순간이 이 경로다**: 안 그리는 동안 DOM 노드가 사라졌다가
    // 방금 새로 생겼으므로, 버튼 CSS의 `left-0 top-0` 그대로 좌상단에 있다. 공 좌표
    // (`ballsRef`)는 컴포넌트가 언마운트되지 않아 살아 있으니, 여기서 한 번 찍어 주면
    // **다들 아까 걷던 자리 그대로** 다시 나타난다(위에서 새로 떨어지지 않는다).
    // 첫 프레임이 어차피 덮어쓰지만 rAF는 다음 페인트까지 한 프레임을 기다리므로,
    // 그 사이의 깜빡임을 없앤다.
    syncTransforms(ballsRef.current, elsRef.current);
    raf = window.requestAnimationFrame(step);

    // 탭 복귀 시 last를 리셋한다 — 백그라운드에서 rAF가 멈춘 사이 흐른 시간이 첫 프레임의
    // dt로 잡히면(수십 초) d가 상한 3까지 튀어 공이 한 번에 훌쩍 점프한다. 0으로 되돌리면
    // 복귀 첫 프레임이 d=1로 시작해 부드럽게 이어진다.
    const onVisible = () => {
      if (!document.hidden) last = 0;
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // `drawing`이 false가 되면(탭바 없는 화면) cleanup이 rAF를 취소하고, 돌아오면 루프가 새로
    // 걸린다. **이 cleanup이 이 파일에서 가장 중요한 줄이다** — 취소가 안 되면 루프가 겹쳐
    // 돌면서 공이 두 배 속도로 움직이고 프레임 비용도 배가 된다("갑자기 느려졌다"의 정체).
    // 복귀 첫 프레임은 last=0에서 시작하므로(위 onVisible과 같은 이유) 튀지 않는다.
  }, [allow, drawing]);

  // 안 그리는 화면(탭바 없음)·모션 비선호·아무도 없음 — 전부 아무것도 안 그린다.
  // 셋 다 렌더 전에 끊어야 아래 `pickVisiblePresence`와 DOM ref 등록이 헛돌지 않는다.
  if (!drawing || !allow || presence.length === 0) return null;

  // 그릴 얼굴만 추린다 — 상한 12명(§lib/presence/pick.ts). 사람이 몰려도 띠가 안 들어차고,
  // 매 프레임 일도 12개로 고정된다. 총원은 전광판 라벨이 말한다.
  const visible = pickVisiblePresence(presence, presenceId);

  return (
    <div
      ref={setWrapEl}
      aria-hidden
      // `.app-fixed` — 데스크톱에서 셸 폭에 맞춘다(§DESIGN.md 앱 셸). 안 붙이면 이 레이어만
      // 화면 전폭으로 남아 공이 셸 밖 회색 지면을 걸어다닌다.
      //
      // `z-40` — 탭바·FAB·다이얼로그(z-50) **아래**. 공이 FAB 뒤로 지나가고 탭은 FAB이 받는다.
      //
      // `pointer-events-none` — 층 전체는 입력을 통과시키고 공(button)만 `auto`로 되받는다.
      // 배경도 없다: 공 말고는 아무것도 없는 투명한 층이라 224px이 화면을 가리지 않는다.
      //
      // `top-0` — **천장이 화면 끝이다.** 층은 탭바 위부터 화면 맨 위까지 차지한다. 한때
      // 224px 띠였는데, 그 높이는 "전력으로 튄 공 한 번이 딱 들어가는" 계산값이라 공중에 뜬
      // 공을 한 번 더 치면 천장에 막혔다. 화면 끝까지 열어 두면 계속 위로 올려 보낼 수 있고,
      // 높이를 계산할 이유 자체가 없어진다. 실제 높이는 ResizeObserver가 잰다.
      //
      // `overflow-hidden` — 그래도 자른다. 화면 밖으로 날아간 공이 문서 크기를 늘려
      // 스크롤바를 만들지 않게.
      className="app-fixed pointer-events-none fixed inset-x-0 top-0 z-40 overflow-hidden"
      style={{ bottom: "var(--tabbar-h)" }}
    >
      {visible.map((person) => {
        const color = PRESENCE_COLORS[getPresenceColorIdx(person.mem_id)];
        return (
          <button
            key={person.mem_id}
            type="button"
            tabIndex={-1}
            aria-hidden
            ref={(node) => {
              elsRef.current.set(person.mem_id, node);
            }}
            // 매 프레임 움직이는 요소라 `click`은 씹힌다 — down에서 즉시 힘을 싣고 남들에게 알린다.
            onPointerDown={(e) => {
              // 아바타를 눌렀으면 그 입력은 여기서 끝낸다 — 이 층은 화면 전체를 덮고 있어
              // 뒤에 늘 다른 버튼(깅스타그램 칸 등)이 있다.
              e.stopPropagation();
              e.preventDefault();
              // ⚠️ **위 두 줄로는 관통이 안 막힌다.** 공은 누르는 순간 위로 튀어 커서 밑에서
              // 사라지는 **움직이는 표적**이라, 뗄 때 그 자리엔 뒤 요소가 남아 있다. 게다가
              // `preventDefault()`는 `click`을 막지 못할 뿐 아니라(스펙상 mousedown/mouseup까지)
              // **`mousedown`을 없애 버려** 브라우저가 "누른 요소"를 기록하지 못하게 만든다 —
              // 그러면 평소 누른 곳과 뗀 곳의 공통 조상(대개 아무 핸들러 없는 `<body>`)에서 났을
              // click이 **뗀 자리 요소**로 떨어진다. 관통을 막으려던 방어가 관통을 만들고 있었다.
              // 그래서 이 탭에서 비롯된 click 한 번을 따로 삼킨다(§lib/presence/swallow-click.ts).
              swallowNextClick();
              // hitX는 **아바타(얼굴) 기준**이어야 튕기는 방향이 맞다. 히트 영역이 아바타보다
              // 넓어졌으므로 버튼 rect가 아니라 안쪽 얼굴 span의 rect로 잰다. 넓힌 여백을
              // 눌러 0~1 밖으로 나가면 튕김 세기(applyBump)가 과해지므로 0~1로 가둔다.
              const face = e.currentTarget.firstElementChild as HTMLElement | null;
              const rect = (face ?? e.currentTarget).getBoundingClientRect();
              const hitX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              // by=내 presenceId — 네온·배지가 **내 색**으로 뜬다(맞은 사람이 아니라 누른 나).
              applyBump(person.mem_id, hitX, presenceId); // 내 화면 즉시 반영
              channelRef.current?.send({
                type: "broadcast",
                event: "bump",
                payload: { mem_id: person.mem_id, hitX, by: presenceId },
              });
            }}
            // 히트 영역만 넓힌다(HIT_PAD): 손가락으로 누르기 쉽게 아바타 둘레에 투명 여백을
            // 두르되, 음수 마진으로 상쇄해 **버튼 기준점과 아바타 위치는 그대로** 유지한다.
            // SIZE는 물리(벽·바닥·좌표) 전반이 쓰는 값이라 건드리지 않는다 — 여긴 시각·물리가
            // 아니라 입력 영역만의 문제다.
            style={{
              width: SIZE + HIT_PAD * 2,
              padding: HIT_PAD,
              margin: -HIT_PAD,
            }}
            className="pointer-events-auto absolute left-0 top-0 flex flex-col items-center"
          >
            {/* 회전은 얼굴만 — 이름표까지 같이 돌면 읽을 수 없다.
                네온 링(box-shadow)은 매 프레임 JS가 pop 값으로 직접 갱신하므로 CSS
                transition을 걸지 않는다 — 걸면 프레임마다 트랜지션이 리셋돼 페이드가 끊긴다. */}
            <span
              className="block rounded-full"
              style={{ width: SIZE, height: SIZE }}
            >
              <PresenceFace
                id={person.mem_id}
                name={person.mem_nm}
                avatarUrl={person.avatar_url}
              />
            </span>
            {/* 튕김 배지 스택 — 얼굴의 두 번째 형제(children[1]). 루프가 매 프레임 채운다.
                우측 상단에 얹되 위로 쌓이도록 column-reverse(먼저 친 색이 아래에 남는다).
                절대배치라 이름표 레이아웃을 밀지 않는다. 버튼엔 HIT_PAD 패딩이 있으므로
                얼굴 span 오른쪽 위 모서리(HIT_PAD + SIZE, HIT_PAD)를 기준으로 살짝 겹쳐 얹는다. */}
            <span
              aria-hidden
              className="pointer-events-none absolute flex flex-col-reverse items-start gap-0.5"
              style={{ left: HIT_PAD + SIZE + 4, top: HIT_PAD - 6 }}
            />
            {/* 이름표 — 사람 고정색. 배경 위에서 읽히게 얇은 외곽선을 깐다 */}
            <span
              className="pointer-events-none whitespace-nowrap text-[9px] font-medium leading-none"
              style={{
                color,
                textShadow:
                  "0 0 2px var(--background), 0 0 2px var(--background), 0 0 3px var(--background)",
              }}
            >
              {person.mem_nm}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 접속자 얼굴 — 로그인 멤버는 아바타, 익명은 회색 물음표.
 *
 * 익명에게 DiceBear 랜덤 얼굴을 주면 로그인 멤버와 구분이 안 돼 "저 사람 누구지?" 하고
 * 헛되이 찾게 된다. 무채색 물음표로 통일하면 "얜 지나가는 익명 손님"이 담백하게 읽힌다 —
 * 이름표 색(바깥)은 그대로 살아 있어 개별 식별은 된다.
 */
function PresenceFace({
  id,
  name,
  avatarUrl,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
}) {
  if (isAnonPresence(id)) {
    // 익명은 **회색 원 바탕 + 두꺼운 물음표**. 무채색이라야 색 있는 로그인 아바타 사이에서
    // "이건 사람이 아니라 익명 자리"로 구분된다. 바깥 span이 이미 원형 프레임(rounded-full)이라
    // 여기선 원을 또 그리지 않고 배경만 채운다 — size-full로 그 원을 그대로 메운다.
    // 물음표만 있는 아이콘(HelpCircle의 테두리 원 없이)을 두껍게 키워 담백하게 세운다.
    return (
      <span className="flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground">
        <span className="text-[18px] font-bold leading-none" aria-hidden>
          ?
        </span>
      </span>
    );
  }
  return <Avatar src={avatarUrl} seed={id} alt={name} size="sm" />;
}
