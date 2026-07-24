"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { createClient } from "@/lib/supabase/client";

import { Avatar } from "@/components/common/avatar";

/** 아바타 지름(px) */
const SIZE = 32;
/** 반지름 — 구르는 회전각 계산(회전각 = 이동거리 / 반지름)에 쓴다 */
const RADIUS = SIZE / 2;

// ── 물리 상수 (#2 튜닝: 더 높이 튀고, 더 floaty하게, 연타 쉽게) ──
/** 중력(px/frame²) — 이전 0.4에서 낮춰(≈0.65x) 체공을 늘린다. 연타로 이어 튕기기 쉬워진다 */
const GRAVITY = 0.26;
/** 구르는 기본 수평 속도(px/frame) — 이전 0.22의 ≈0.8x. 전체 무빙을 조금 느긋하게 */
const ROLL_BASE = 0.18;
/** 바닥 반발계수 */
const BOUNCE = 0.6;
/** 벽 반발계수 */
const WALL_BOUNCE = 0.6;
/** 공중 수평 저항 */
const AIR_DRAG = 0.99;
/** 클릭 시 튀는 힘(위) — 이전 6.8에서 키워 더 높이 뜬다 */
const POP_UP = 9.6;
/** 클릭 시 옆으로 흩는 힘 최대치 */
const POP_SIDE = 4.2;
/** 이 속도 미만의 수직 튐은 바닥에 안착(무한 미세 진동 방지) */
const REST_VY = 1.2;
/** 바닥에서 목표 속도로 부드럽게 붙는 정도 — 낮을수록 관성 있게 스르륵 (#1 기계느낌 제거의 핵심) */
const VEL_LERP = 0.055;

/** 클릭 링 이펙트 — 누가 눌렀는지 색으로 구분(전광판 톤과 무관한 놀이 색) */
const RING_COLORS = [
  "#ff5d73", "#ffb020", "#22c55e", "#38bdf8",
  "#a855f7", "#f472b6", "#14b8a6",
];

/** [min,max) 정수 랜덤 */
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

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
  /** 현재 바닥 행동(구르기/멈춤)의 남은 프레임 */
  phase: number;
  /** 클릭 링 남은 프레임 */
  pop: number;
  /** 링 색 인덱스 */
  ringIdx: number;
};

/** 브로드캐스트 메시지 */
type BumpMsg = { mem_id: string; hitX: number; ring: number };
type PosMsg = { mem_id: string; x: number; y: number };

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
 * 탭하면 그 아바타가 통통 튀는데, **이 튕김은 broadcast로 모두에게 전해진다**(같은 mem_id에
 * 같은 임펄스가 실린다). 그래서 서로 같은 공을 주고받고, 남이 튕기는 걸 방해할 수도 있다.
 * 물리 계산은 각자 화면이 돌리므로 위치는 사람마다 조금 다를 수 있다(정밀 동기화 아님) —
 * 대신 공이 **바닥에 안착할 때** 그 주인이 위치를 한 번 흘려보내(pos) 느슨히 다시 맞춘다.
 *
 * 자율 이동(#1): 고정 속도로 "2초 굴러 1초 멈춤"을 반복하면 기계벌레처럼 보인다. 그래서 매 구간
 * 목표 속도·방향·길이를 넓은 범위에서 새로 뽑고, 실제 속도는 목표로 **스르륵**(VEL_LERP) 붙게 해
 * 가속·감속이 부드럽다 — 굴러가다 문득 멈춰 생각하고 반대로 어슬렁대는 결이 된다.
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

  const applyBump = (memId: string, hitX: number, ring: number) => {
    const b = ballsRef.current.get(memId);
    if (!b) return;
    b.airborne = true;
    b.vy = -POP_UP;
    b.vx = -(hitX - 0.5) * 2 * POP_SIDE; // 가운데=수직, 가장자리=옆으로
    b.pop = 34;
    b.ringIdx = ring;
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
        applyBump(p.mem_id, p.hitX, p.ring ?? 0);
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
    presence.forEach((p, i) => {
      if (ballsRef.current.has(p.mem_id)) return;
      const w = wrapRef.current?.clientWidth ?? 320;
      const h = wrapRef.current?.clientHeight ?? 176;
      ballsRef.current.set(p.mem_id, {
        x: Math.random() * (w - SIZE),
        y: Math.random() * (h * 0.3),
        vx: 0,
        vy: 0,
        rot: Math.random() * 360,
        targetVx: 0,
        airborne: true, // 떨어져 안착하며 등장
        phase: randInt(30, 120),
        pop: 0,
        ringIdx: i % RING_COLORS.length,
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
      const floor = bh - SIZE;

      for (const [memId, b] of ballsRef.current) {
        if (b.airborne) {
          b.vy += GRAVITY;
          b.vx *= AIR_DRAG;
        } else {
          // 바닥 상태머신 — 구간이 끝나면 목표 속도·방향·길이를 새로 뽑는다(#1 자연스러움).
          b.phase -= 1;
          if (b.phase <= 0) {
            if (Math.random() < 0.38) {
              // 멈춰서 생각
              b.targetVx = 0;
              b.phase = randInt(45, 170);
            } else {
              // 어슬렁 — 방향·속도 랜덤(가끔 빠른 종종걸음)
              const dir = Math.random() < 0.5 ? -1 : 1;
              const fast = Math.random() < 0.15;
              const speed = ROLL_BASE * (fast ? 2.0 + Math.random() : 0.4 + Math.random() * 1.4);
              b.targetVx = dir * speed;
              b.phase = randInt(fast ? 20 : 40, fast ? 55 : 180);
            }
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
        }
        if (b.x >= bw - SIZE) {
          b.x = bw - SIZE;
          b.vx = -Math.abs(b.vx) * (b.airborne ? WALL_BOUNCE : 1);
          b.targetVx = -Math.abs(b.targetVx);
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
            b.phase = randInt(30, 90);
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
          node.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.rot}deg)`;
          node.style.boxShadow =
            b.pop > 0 ? `0 0 0 3px ${RING_COLORS[b.ringIdx % RING_COLORS.length]}` : "";
        }
      }
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [allow]);

  if (presence.length === 0) return null;

  // prefers-reduced-motion — 유영 대신 하단에 정적으로 늘어놓는다(누가 있는지는 보이게)
  if (!allow) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-2 bottom-1 flex flex-wrap gap-1"
      >
        {presence.map((p) => (
          <Avatar key={p.mem_id} src={p.avatar_url} seed={p.mem_id} alt={p.mem_nm} size="sm" />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {presence.map((person, i) => (
        <button
          key={person.mem_id}
          type="button"
          tabIndex={-1}
          ref={(node) => {
            elsRef.current.set(person.mem_id, node);
          }}
          // 매 프레임 움직이는 요소라 `click`은 씹힌다 — down에서 즉시 힘을 싣고 남들에게 알린다.
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const hitX = (e.clientX - rect.left) / rect.width;
            const ring = i % RING_COLORS.length;
            applyBump(person.mem_id, hitX, ring); // 내 화면 즉시 반영
            channelRef.current?.send({
              type: "broadcast",
              event: "bump",
              payload: { mem_id: person.mem_id, hitX, ring },
            });
          }}
          style={{ width: SIZE, height: SIZE }}
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
