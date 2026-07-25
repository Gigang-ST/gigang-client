"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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

/** 브로드캐스트 메시지 — 튕김만 주고받는다(위치는 각자 화면이 알아서 굴린다) */
type BumpMsg = { mem_id: string; hitX: number };

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
 * 탭했을 때 아바타에 두르는 **네온 발광** — 테두리에서 시작해 바깥으로 매끄럽게 옅어진다.
 *
 * 목표는 "얇은 실선 링 + 별도 glow" 두 덩어리가 아니라, **테두리가 곧 glow의 가장 진한
 * 부분**인 하나의 연속된 빛이다. 그러려면 두 가지가 필요하다:
 *
 * 1. 실선 링을 **얇게**(1.5px) — 균일한 딱딱한 테두리는 눈에 "선"으로 잡혀 glow와 분리돼
 *    보인다. 존재는 하되 가늘어서 glow의 시작점 역할만 한다.
 * 2. glow 겹을 **촘촘하게 여러 개** — blur를 5·9·17·27·42px로 조밀하게 쌓고 알파를 계단식으로
 *    낮추면, 겹 사이 간격이 안 보여 하나의 그라데이션으로 읽힌다. 예전엔 6·14·26px로 띄엄띄엄이라
 *    링과 glow가 따로 놀았다. 테두리 근처(5·9px)를 가장 진하게 둬서 "가까울수록 진하다"를 만든다.
 *
 * `pop`(POP_MAX→0)으로 세기를 페이드한다 — 튕긴 순간 가장 밝고 1초에 걸쳐 꺼진다. 실선 링만
 * 두께를 유지하고 glow의 알파·번짐이 줄어, 빛이 테두리로 빨려들며 사라진다.
 */
function neonRing(ringIdx: number, pop: number): string {
  const rgb = hexToRgb(PRESENCE_COLORS[ringIdx % PRESENCE_COLORS.length]);
  const t = Math.max(0, Math.min(1, pop / POP_MAX)); // 1=방금 눌림, 0=꺼짐
  // 알파는 t를 살짝 완만하게(제곱근) — 후반부에 너무 급히 꺼지지 않게
  const a = Math.sqrt(t);
  // blur 거리는 이전 값의 1.5배(더 멀리 번짐), 알파는 각 겹을 올려(더 진함) 조정했다.
  return [
    `0 0 0 1.5px rgba(${rgb},${(1 * a).toFixed(2)})`, // 얇은 실선 링 — glow의 시작점
    `0 0 5px 1px rgba(${rgb},${(1 * a).toFixed(2)})`, // 테두리 바로 밖 — 가장 진하다
    `0 0 9px 1.5px rgba(${rgb},${(0.9 * a).toFixed(2)})`,
    `0 0 17px 3px rgba(${rgb},${(0.7 * a).toFixed(2)})`,
    `0 0 27px 5px rgba(${rgb},${(0.5 * a).toFixed(2)})`,
    `0 0 42px 8px rgba(${rgb},${(0.3 * a).toFixed(2)})`, // 가장 바깥 — 옅게 사라진다
  ].join(", ");
}

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

  const applyBump = (memId: string, hitX: number) => {
    const b = ballsRef.current.get(memId);
    if (!b) return;
    b.airborne = true;
    b.vy = -POP_UP;
    b.vx = -(hitX - 0.5) * 2 * POP_SIDE; // 가운데=수직, 가장자리=옆으로
    b.pop = POP_MAX;
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
        setPresence(list);
      })
      .on("broadcast", { event: "bump" }, ({ payload }) => {
        const p = payload as BumpMsg;
        applyBump(p.mem_id, p.hitX);
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
      void supabase.removeChannel(channel);
    };
  }, [teamId, presenceId, presenceNm, presenceAvatar]);

  // ── 접속 목록 → 공(Ball) 맞춤: 새 얼굴은 위에서 떨어지며 등장, 나간 얼굴은 제거 ──
  // Math.random은 effect 안에서만(렌더/ref콜백에서 금지 — react-hooks/purity).
  useEffect(() => {
    const ids = new Set(presence.map((p) => p.mem_id));
    presence.forEach((p) => {
      if (ballsRef.current.has(p.mem_id)) return;
      // 0-폴백 함정 회피: clientWidth/Height가 0이면 `?? 폴백`이 안 먹으므로 직접 거른다
      // (루프의 bw/bh 계산과 같은 이유). 여기서 잘못 잡히면 초기 y가 어긋난다.
      const rawW = wrapRef.current?.clientWidth ?? 0;
      const rawH = wrapRef.current?.clientHeight ?? 0;
      const w = rawW > 0 ? rawW : 320;
      const h = rawH > 0 ? rawH : 176;
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
    let last = 0;
    const step = (now: number) => {
      // 프레임 수가 아니라 **경과 시간**으로 움직인다. 안 그러면 화면 주사율이 그대로 속도가 돼
      // 144Hz 데스크톱은 2배 빠르고, 저전력 모드로 30Hz까지 떨어진 아이폰은 절반으로 느려진다.
      // d = 60fps 기준 배율(60Hz면 1). 상한 3은 탭을 다시 켰을 때 순간이동을 막는 안전장치.
      const d = last ? Math.min((now - last) / 16.667, 3) : 1;
      last = now;

      const el = wrapRef.current;
      // `?? 폴백`은 clientWidth/Height가 **0일 때 안 먹는다**(`0 ?? x`는 0을 반환). 레이아웃
      // 확정 전 첫 프레임엔 0이 나올 수 있는데, 그대로 floor를 계산하면 floor가 음수가 돼
      // 등장하자마자 바닥에 붙는다("안 떨어짐" 버그의 다른 절반). 0/비정상값이면 폴백을 쓴다.
      const rawW = el?.clientWidth ?? 0;
      const rawH = el?.clientHeight ?? 0;
      const bw = rawW > 0 ? rawW : 320;
      const bh = rawH > SIZE + LABEL_H ? rawH : 176;
      // 이름표가 잘리지 않을 만큼만 올린다. LIVE 라벨은 이 바닥선 위에 겹쳐 뜨므로 빼지 않는다.
      const floor = bh - SIZE - LABEL_H;

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
            face.style.boxShadow = b.pop > 0 ? neonRing(b.ringIdx, b.pop) : "";
          }
        }
      }
      raf = window.requestAnimationFrame(step);
    };
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
      <span className="font-numeric text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
        지금 보는 중 {presence.length}명
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
              <span className="block size-8">
                <PresenceFace
                  id={p.mem_id}
                  name={p.mem_nm}
                  avatarUrl={p.avatar_url}
                />
              </span>
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
              // 아바타를 눌렀으면 그 입력은 여기서 끝낸다 — 넓힌 히트 영역이 뒤에 겹친 리드
              // 카드·응원 버튼 위에 얹히면, 아바타를 튕기려던 탭이 뒤 요소까지 누르는(관통)
              // 문제가 생긴다. stopPropagation으로 버블을 끊고 preventDefault로 뒤따르는
              // click/합성 이벤트가 뒤 요소로 흘러가는 것도 막는다.
              e.stopPropagation();
              e.preventDefault();
              // hitX는 **아바타(얼굴) 기준**이어야 튕기는 방향이 맞다. 히트 영역이 아바타보다
              // 넓어졌으므로 버튼 rect가 아니라 안쪽 얼굴 span의 rect로 잰다. 넓힌 여백을
              // 눌러 0~1 밖으로 나가면 튕김 세기(applyBump)가 과해지므로 0~1로 가둔다.
              const face = e.currentTarget.firstElementChild as HTMLElement | null;
              const rect = (face ?? e.currentTarget).getBoundingClientRect();
              const hitX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              applyBump(person.mem_id, hitX); // 내 화면 즉시 반영
              channelRef.current?.send({
                type: "broadcast",
                event: "bump",
                payload: { mem_id: person.mem_id, hitX },
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
