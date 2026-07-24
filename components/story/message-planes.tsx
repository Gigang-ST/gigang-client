"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { messageCountdown, messageRemainMs } from "@/lib/story-message";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { MessageCreateDialog } from "@/components/story/message-create-dialog";

import type { StoryMessage } from "@/lib/queries/story-messages";
import type { CSSProperties } from "react";

/** 하늘에 동시에 띄우는 개수 — 넘기면 h-44 안에서 배너끼리 고도가 겹쳐 서로를 가린다 */
const SKY_SHOWN = 3;

/** 종이비행기 그림의 원본 픽셀 크기(트림 후). 비율 2.76:1 */
const PLANE_W = 240;
const PLANE_H = 87;

/**
 * 종이비행기 아이콘 — 크루가 준 손그림(`public/story/paper-plane.png`)을 쓴다.
 * 원본은 흰 배경·검은 선이라, 흰 배경을 투명으로 빼고(sharp 전처리) 검은 선만 남겼다.
 *
 * 그림이 이미 **왼쪽을 향해** 있어 좌우 반전은 하지 않는다(비행 방향 오→왼과 기수가 맞는다).
 * `scaleX`로 가로만 살짝 눌러 뾰족한 원본보다 통통하게(귀엽게) 만든다 — 세로는 그대로.
 * 다크모드는 `dark:invert`(검은 선을 흰 선으로) — `social-links`의 흑백 로고 패턴 그대로.
 *
 * 크기는 호출부가 높이(`h-*`)로 정하고 폭은 비율로 따라온다. `transform`(scaleX)은 이 img에
 * 걸리는데, 비행 애니메이션의 `transform`은 **바깥 요소**에 걸어 서로 덮어쓰지 않게 한다.
 */
function PaperPlane({ className }: { className?: string }) {
  return (
    <Image
      src="/story/paper-plane.png"
      alt=""
      width={PLANE_W}
      height={PLANE_H}
      aria-hidden
      draggable={false}
      className={cn(
        "w-auto origin-center select-none object-contain [transform:scaleX(0.82)] dark:invert",
        className,
      )}
      unoptimized
    />
  );
}

/**
 * 종이비행기 한마디 — 신문지를 접어 날린 비행기가 한마디 배너를 끌고 지면을 가로지른다.
 *
 * 기강이야기 상단(기상대 바로 아래)에 놓인다. "날아가는 글씨는 못 읽는다"는 문제를
 * 해변 광고비행기 방식(비행기가 배너를 견인)으로 푼다. 오른쪽에서 왼쪽으로 난다.
 *
 * **여기 싣는 건 각오가 아니라 한마디다.** 각오는 팻말(`PledgeSigns`)에 꽂혀 만료 없이
 * 남고 1인 1개지만, 한마디는 24시간 뒤 사라지고 1인 여러 개다 — 별개 데이터(`msg_mst`).
 * 배너 오른쪽 시계는 그래서 올라가지 않고 **내려간다**: `24:00:00`에서 시작해 0이 되면
 * 하늘에서 빠진다(행은 남는다 — 이력 보존).
 *
 * 착륙장은 없다. 24시간이면 알아서 사라지니 "내려앉아 쌓이는 자리"가 필요 없고, 그래서
 * 띄우기(`float_at` 편성)도 없다 — 최신 한마디가 그냥 하늘을 채운다.
 *
 * 접근성: 날아다니는 배너는 움직이는 타깃이라 누르기 어렵다. 애초에 누르는 대상이 아니고
 * (읽으라고 띄우는 것뿐) 텍스트는 실제 텍스트라 스크린리더가 읽는다.
 * `prefers-reduced-motion`이면 CSS가 비행기를 제자리에 세운다.
 */
export function MessagePlanes({
  messages,
  teamId,
  myMemId,
}: {
  /** 서버 한마디 — 24시간 이내, crt_at 최신순. RPC가 만료분을 이미 걸러 준다 */
  messages: StoryMessage[];
  /** Realtime 채널 스코프 */
  teamId: string;
  /** 로그인 사용자 — 없으면 "날리기" 버튼을 감춘다. 구독은 로그인 여부와 무관하게 본다 */
  myMemId: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [writing, setWriting] = useState(false);
  /** 남은 시간 계산용 현재 시각 — 마운트 후에만 채운다(SSR/CSR 불일치 방지) */
  const [nowMs, setNowMs] = useState<number | null>(null);

  // 1초마다 갱신 — 카운트다운의 초가 실제로 흐르고, 0이 된 한마디는 아래 필터가 걷어낸다.
  // 첫 값도 setTimeout(0)으로 비동기 설정한다 — effect 본문에서 동기 setState를 하면
  // 하이드레이션 직후 즉시 리렌더가 걸려(불필요한 캐스케이드) 린트가 막는다. 한 틱 늦어도 눈엔 같다.
  useEffect(() => {
    const first = window.setTimeout(() => setNowMs(Date.now()), 0);
    const iv = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, []);

  // 살아있는 한마디만 — 서버가 준 목록에서 마운트 후 만료된 것을 추가로 걷어낸다.
  // nowMs가 null인 첫 렌더(SSR·하이드레이션)에는 서버 목록을 그대로 쓴다. 여기서 Date.now()를
  // 부르면 서버와 클라가 다른 목록을 그려 하이드레이션이 깨진다.
  const alive = useMemo(() => {
    if (nowMs === null) return messages;
    return messages.filter((m) => messageRemainMs(m.crt_at, nowMs) > 0);
  }, [messages, nowMs]);

  // 하늘에는 최신 것부터 몇 개만. 나머지는 앞엣것이 만료되면 자연히 올라온다.
  const flying = alive.slice(0, SKY_SHOWN);
  const hasMessages = alive.length > 0;

  // Realtime — 누가 한마디를 날리면 열린 모든 화면이 다시 그린다. 연속 이벤트는 350ms로 묶는다.
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => router.refresh(), 350);
  }, [router]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "msg_mst", filter: `team_id=eq.${teamId}` },
        () => scheduleRefresh(),
      )
      .subscribe();
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, teamId, scheduleRefresh]);

  return (
    <section className="flex flex-col">
      <div className="rule-section mx-6 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Sky Notes
        </h2>
      </div>
      <p className="px-6 pt-2.5 font-serif text-[15px] text-muted-foreground">
        {hasMessages
          ? "기강인들이 날린 한마디 — 하루가 지나면 사라져요"
          : "하늘이 아직 비어 있어요 — 첫 한마디를 날려보세요"}
      </p>

      {/* 하늘 — 지면 위 여백을 비행 구역으로 쓴다. 잘라내야 화면 밖에서 들어오는 게 자연스럽다 */}
      <div className="newsprint relative mt-4 h-44 overflow-hidden border-y border-border">
        {/* 떠 있는 한마디는 누르는 대상이 아니다 — 배너를 읽으라고 띄우는 것뿐이다.
            그래서 button이 아니라 div다. */}
        {flying.map((m, i) => (
          <div
            key={m.msg_id}
            style={
              {
                // 고도는 뜬 개수에 맞춰 균등 분배 — 서로 겹치지 않게
                top: `${((i + 1) * 100) / (flying.length + 1)}%`,
                animationDuration: `${16 + i * 5}s`,
                animationDelay: `${i * -6}s`,
              } as CSSProperties
            }
            className="pledge-fly absolute left-0 flex -translate-y-1/2 items-center gap-2"
          >
            <PaperPlane className="h-[22px] shrink-0" />
            {/* 견인 배너 — 비행기 뒤(오른쪽)에 끌린다. 텍스트는 실제 텍스트라 스크린리더가 읽는다 */}
            <span className="whitespace-nowrap rounded-sm border border-border bg-background/85 px-2 py-1 text-[12px] text-foreground shadow-sm backdrop-blur-[1px]">
              {m.msg_txt}
              <span className="pl-1.5 text-[10px] text-muted-foreground">
                — {m.mem_nm}
              </span>
              {nowMs !== null && (
                // 남은 시간 — 24:00:00에서 줄어든다. 매초 바뀌는 시계라 스크린리더가
                // 계속 읽지 않게 aria-hidden(한마디·이름은 위에서 이미 읽힌다).
                <span
                  aria-hidden
                  className="pl-2 font-numeric text-[10px] text-muted-foreground/70 tabular-nums"
                >
                  {messageCountdown(m.crt_at, nowMs)}
                </span>
              )}
            </span>
          </div>
        ))}

        {!hasMessages && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
            아직 아무도 날리지 않았어요
          </p>
        )}
      </div>

      {/* 한마디 날리기 — 로그인 멤버만. 비로그인에겐 버튼을 감춘다(응원·내역과 동일 정책) */}
      {myMemId && (
        <div className="px-6">
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PaperPlane className="h-4" /> 한마디 접어 날리기
          </button>
        </div>
      )}

      <MessageCreateDialog open={writing} onOpenChange={setWriting} />
    </section>
  );
}
