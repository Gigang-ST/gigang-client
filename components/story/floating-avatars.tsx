"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  PRESENCE_COLORS,
  getPresenceColorIdx,
  getPresencePersona,
} from "@/lib/story-presence";
import { createClient } from "@/lib/supabase/client";

import { Avatar } from "@/components/common/avatar";

/** 아바타 지름(px) */
const SIZE = 32;
/** 반지름 — 구르는 회전각 계산(회전각 = 이동거리 / 반지름)에 쓴다 */
const RADIUS = SIZE / 2;
/** 이름표를 놓을 아바타 아래 여유(px) — 바닥 판정은 이 띠를 뺀 높이 기준 */
const LABEL_H = 13;
/**
 * LIVE 라벨을 바닥선에서 얼마나 **띄울지**(px).
 *
 * 라벨은 자기 자리를 따로 갖지 않는다 — 아바타 바닥선 위에 겹쳐 떠 있다. 라벨 몫으로 띠를
 * 따로 잡으면 이름표까지 더해져 리드 아래 여백이 눈에 띄게 커진다. 겹쳐도 읽히는 이유는
 * 얼굴은 지나가고 라벨은 흐린 보조 텍스트라, 가려지는 건 한순간이기 때문.
 */
const BADGE_LIFT = 16;

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

/** 접속자 한 명 — presence로 실어 나르는 표시정보 */
type Presence = { mem_id: string; mem_nm: string; avatar_url: string | null };

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
  /** 링 색 인덱스 — 사람마다 고정(mem_id 해시) */
  ringIdx: number;
  /** 사람별 성격 — 걸음 속도·멈춤 성향 */
  pace: number;
  stillness: number;
  restless: number;
  /** 구경 중 좌우로 살짝 기우뚱하는 위상 — 멈춰 있어도 죽어 보이지 않게 */
  sway: number;
};

/** 브로드캐스트 메시지 */
type BumpMsg = { mem_id: string; hitX: number };
type PosMsg = { mem_id: string; x: number; y: number };

/** [min,max) 정수 랜덤 */
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
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
 * 떠다니는 아바타 — **지금 전광판을 보고 있는 크루원**이 리드 위를 유영한다.
 *
 * 피드에 등장한 얼굴이 아니라 **실시간 접속자**다(Supabase Realtime presence). 로그인 사용자가
 * `/story`를 열면 자기 얼굴을 하늘에 올리고(track), 나가면 사라진다. 비로그인도 이 하늘을 보지만
 * 자기 아바타는 없다 — "지금 누가 같이 보고 있나"를 얼굴로 전한다.
 *
 * 이 정체를 모르면 그냥 굴러다니는 장식으로 보이므로, 좌상단에 **"LIVE · 지금 보는 중 N"** 라벨을
 * 상시로 띄우고 그 옆 `HelpTip`이 노는 법까지 답한다. 라벨이 없으면 아무도 안 물어보고 안 논다.
 *
 * 탭하면 그 아바타가 통통 튀는데, **이 튕김은 broadcast로 모두에게 전해진다**(같은 mem_id에
 * 같은 임펄스가 실린다). 그래서 서로 같은 공을 주고받고, 남이 튕기는 걸 방해할 수도 있다.
 * 물리 계산은 각자 화면이 돌리므로 위치는 사람마다 조금 다를 수 있다(정밀 동기화 아님) —
 * 대신 공이 **바닥에 안착할 때** 그 주인이 위치를 한 번 흘려보내(pos) 느슨히 다시 맞춘다.
 *
 * **색은 사람에게 고정**된다(`lib/story-presence.ts` — mem_id 해시). 링 색과 이름표 색이 같은
 * 색이라 "저 초록이 준민"이 학습되고, 남이 내 공을 튕겨도 누가 튕겼는지가 색으로 읽힌다.
 * 랜덤 색이면 같은 사람이 매번 다른 색으로 나와 아무 정보도 안 남는다.
 *
 * 걸음도 사람마다 다르다(persona): 목적지를 잡고 쭉 걷는 사람(trek), 한참 멈춰 구경하는
 * 사람(watch), 제자리에서 서성이는 사람(fidget), 목적 없이 어슬렁대는 사람(stroll)이 섞인다.
 *
 * 물리 상태는 ref(Map)에 두고 rAF에서 DOM transform을 직접 갱신한다. `prefers-reduced-motion`이면
 * 유영을 멈추고 접속자를 하단에 정적으로 늘어놓는다(누가 있는지는 여전히 보이게).
 */
export function FloatingAvatars({
  teamId,
  me,
}: {
  teamId: string;
  /** 로그인 사용자 — presence에 등록할 내 얼굴. 비로그인이면 null(구경만) */
  me: { id: string; name: string; avatarUrl: string | null } | null;
}) {
  const allow = useAllowMotion();
  const wrapRef = useRef<HTMLDivElement>(null);

  /** 현재 접속자 목록 — presence sync로 갱신 */
  const [presence, setPresence] = useState<Presence[]>([]);

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

  const meIdRef = useRef<string | null>(meId);
  useEffect(() => {
    meIdRef.current = meId;
  }, [meId]);

  const applyBump = (memId: string, hitX: number) => {
    const b = ballsRef.current.get(memId);
    if (!b) return;
    b.airborne = true;
    b.vy = -POP_UP;
    b.vx = -(hitX - 0.5) * 2 * POP_SIDE; // 가운데=수직, 가장자리=옆으로
    b.pop = 34;
  };

  // ── Realtime presence + broadcast 채널 ──
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`story-avatars:${teamId}`, {
      config: { presence: { key: meId ?? "" } },
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
        setPresence(list);
      })
      .on("broadcast", { event: "bump" }, ({ payload }) => {
        const p = payload as BumpMsg;
        applyBump(p.mem_id, p.hitX);
      })
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        const p = payload as PosMsg;
        const b = ballsRef.current.get(p.mem_id);
        // 안착(정지) 상태일 때만 살짝 맞춘다 — 날아가는 중이면 방해하지 않는다
        if (b && !b.airborne) {
          b.x = p.x;
          b.y = p.y;
        }
      })
      .subscribe((status) => {
        // 로그인 사용자만 자기 얼굴을 올린다(track). 비로그인은 구독만 해서 구경.
        if (status === "SUBSCRIBED" && meId) {
          void channel.track({
            mem_id: meId,
            mem_nm: meNm ?? "",
            avatar_url: meAvatar,
          });
        }
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [teamId, meId, meNm, meAvatar]);

  // ── 접속 목록 → 공(Ball) 맞춤: 새 얼굴은 위에서 떨어지며 등장, 나간 얼굴은 제거 ──
  // Math.random은 effect 안에서만(렌더/ref콜백에서 금지 — react-hooks/purity).
  useEffect(() => {
    const ids = new Set(presence.map((p) => p.mem_id));
    presence.forEach((p) => {
      if (ballsRef.current.has(p.mem_id)) return;
      const w = wrapRef.current?.clientWidth ?? 320;
      const h = wrapRef.current?.clientHeight ?? 176;
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
  }, [presence]);

  // ── 애니메이션 루프 ──
  useEffect(() => {
    if (!allow) return;
    let raf = 0;
    const step = () => {
      const el = wrapRef.current;
      const bw = el?.clientWidth ?? 320;
      const bh = el?.clientHeight ?? 176;
      // 이름표가 잘리지 않을 만큼만 올린다. LIVE 라벨은 이 바닥선 위에 겹쳐 뜨므로 빼지 않는다.
      const floor = bh - SIZE - LABEL_H;

      for (const [memId, b] of ballsRef.current) {
        if (b.airborne) {
          b.vy += GRAVITY;
          b.vx *= AIR_DRAG;
        } else {
          // 바닥 상태머신 — 행동이 끝나면 성격에 맞춰 다음 행동을 새로 뽑는다.
          b.phase -= 1;
          // trek은 목적지 도착으로 끝난다(남은 거리가 한 걸음보다 짧으면 도착)
          const arrived =
            b.act === "trek" && Math.abs(b.goalX - b.x) < Math.abs(b.vx) + 1.5;
          if (b.phase <= 0 || arrived) pickAct(b, bw);

          if (b.act === "watch") {
            // 멈춰 구경 — 완전 정지는 죽어 보인다. 아주 느리게 좌우로 기우뚱(무게중심 이동).
            b.sway += 0.02;
            b.targetVx = Math.sin(b.sway) * 0.05;
          }

          // 목표 속도로 스르륵 붙는다(부드러운 가감속). 급정지·급출발이 없어 기계느낌이 사라진다.
          b.vx += (b.targetVx - b.vx) * VEL_LERP;
          b.vy = 0;
        }

        b.x += b.vx;
        b.y += b.vy;
        b.rot += (b.vx / RADIUS) * (180 / Math.PI);

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
          if (b.vy > REST_VY) {
            b.vy = -b.vy * BOUNCE;
          } else if (b.airborne) {
            // 착지 — 상태머신 시작
            b.vy = 0;
            b.airborne = false;
            // 착지 직후엔 잠깐 얼떨떨하게 멈췄다가 움직인다(착지=즉시 질주는 어색하다)
            b.act = "watch";
            b.targetVx = 0;
            b.phase = randInt(25, 70);
            // 안착 재정렬: 내 아바타면 이 위치를 흘려보내 남들이 느슨히 맞추게 한다
            if (memId === meIdRef.current) {
              channelRef.current?.send({
                type: "broadcast",
                event: "pos",
                payload: { mem_id: memId, x: Math.round(b.x), y: Math.round(b.y) },
              });
            }
          }
        }

        if (b.pop > 0) b.pop -= 1;

        const node = elsRef.current.get(memId);
        if (node) {
          // 아바타만 굴리고 이름표는 안 돌린다 — 회전은 안쪽 래퍼에서 처리(아래 렌더 참고)
          node.style.transform = `translate(${b.x}px, ${b.y}px)`;
          const face = node.firstElementChild as HTMLElement | null;
          if (face) {
            face.style.transform = `rotate(${b.rot}deg)`;
            face.style.boxShadow =
              b.pop > 0
                ? `0 0 0 3px ${PRESENCE_COLORS[b.ringIdx % PRESENCE_COLORS.length]}`
                : "";
          }
        }
      }
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [allow]);

  if (presence.length === 0) return null;

  /**
   * LIVE 라벨 — "이 얼굴들이 뭔가"에 답하는 장치. 없으면 그냥 장식으로 보인다.
   *
   * 위가 아니라 **아래**에 둔다: 위엔 리드 기사의 어깨제목(kicker)이 있어 겹치고, 무엇보다
   * 아바타가 걸어다니는 바닥선 옆에 붙어야 "이 라벨이 저 얼굴들 설명"이라고 읽힌다.
   *
   * 설명은 붙이지 않는다 — 점멸하는 점 + 인원수면 "지금 몇 명이 보고 있다"는 충분히 읽히고,
   * 노는 법(탭하면 튄다)은 한 번 눌러보면 아는 것이라 물음표를 세울 만큼의 값이 아니다.
   * 포인터도 통과시킨다: 아무것도 누를 게 없는데 막으면 이 띠에서 리드 스와이프만 죽는다.
   *
   * 바닥선 **위에 겹쳐** 띄운다(BADGE_LIFT). 아래에 따로 자리를 주면 이름표 몫까지 더해져
   * 리드 아래 여백만 커진다 — 지나가는 얼굴에 잠깐 가려지는 편이 낫다.
   */
  const liveBadge = (
    <div
      aria-hidden
      style={{ bottom: BADGE_LIFT }}
      className="pointer-events-none absolute left-6 z-10 flex items-center gap-1.5"
    >
      <span className="board-blink size-1.5 rounded-full bg-[#ff5d73]" />
      <span className="font-numeric text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        LIVE {presence.length}
      </span>
    </div>
  );

  // prefers-reduced-motion — 유영 대신 하단에 정적으로 늘어놓는다(누가 있는지는 보이게)
  if (!allow) {
    return (
      <div className="pointer-events-none absolute inset-0">
        {liveBadge}
        {/* 정적 배치라 라벨과 자리가 고정으로 겹칠 수 있다 — 얼굴 줄만 라벨 왼쪽을 비켜 시작한다 */}
        <div className="pointer-events-none absolute inset-x-6 bottom-0 flex flex-wrap items-end gap-2 pl-24">
          {presence.map((p) => (
            <div key={p.mem_id} className="flex w-11 flex-col items-center gap-0.5">
              <Avatar src={p.avatar_url} seed={p.mem_id} alt={p.mem_nm} size="sm" />
              <span
                className="max-w-full truncate text-[9px] leading-none"
                style={{ color: PRESENCE_COLORS[getPresenceColorIdx(p.mem_id)] }}
              >
                {p.mem_nm}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {liveBadge}
      {presence.map((person) => {
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
              const rect = e.currentTarget.getBoundingClientRect();
              const hitX = (e.clientX - rect.left) / rect.width;
              applyBump(person.mem_id, hitX); // 내 화면 즉시 반영
              channelRef.current?.send({
                type: "broadcast",
                event: "bump",
                payload: { mem_id: person.mem_id, hitX },
              });
            }}
            style={{ width: SIZE }}
            className="pointer-events-auto absolute left-0 top-0 flex flex-col items-center"
          >
            {/* 회전은 얼굴만 — 이름표까지 같이 돌면 읽을 수 없다 */}
            <span
              className="block rounded-full transition-shadow"
              style={{ width: SIZE, height: SIZE }}
            >
              <Avatar
                src={person.avatar_url}
                seed={person.mem_id}
                alt={person.mem_nm}
                size="sm"
              />
            </span>
            {/* 이름표 — 사람 고정색. 배경 위에서 읽히게 얇은 외곽선을 깐다 */}
            <span
              className="pointer-events-none max-w-[52px] truncate text-[9px] font-medium leading-none"
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
