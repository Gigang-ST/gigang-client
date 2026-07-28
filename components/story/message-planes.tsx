"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { setFlyDist } from "@/app/actions/story/set-fly-dist";
import { messageCountdown, messageRemainMs } from "@/lib/story-message";
import { flyAltitude, formatFlyDist } from "@/lib/story-throw";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { HelpTip } from "@/components/common/help-tip";
import { MessageCompose } from "@/components/story/message-compose";
import { SkyFace } from "@/components/story/sky-face";
import { StoryZoneHeader } from "@/components/story/story-zone-header";
import { ThrowStage } from "@/components/story/throw-stage";

import type { StoryMessage } from "@/lib/queries/story-messages";
import type { CSSProperties } from "react";

/** 하늘에 동시에 띄우는 개수 — 넘기면 h-44 안에서 배너끼리 고도가 겹쳐 서로를 가린다 */
const SKY_SHOWN = 3;

/**
 * 던진 거리 → 하늘에서의 top(%). **거리를 값이 아니라 순위로 쓴다.**
 *
 * 처음엔 거리를 높이에 직접 매핑하고 겹침은 순번으로 조금 흩어(±8%) 풀려 했는데,
 * 실제로 그려 보니 네 가지 대표 배치가 **전부 겹쳤다**(간격 9~19px, 한 줄에 34px 필요).
 * 2.1km와 안 던진 것(중앙)처럼 고도가 가까우면 흔들기로는 배너 높이를 못 벌린다 —
 * 하늘이 176px뿐이라 애초에 값에 비례해 놓을 만한 세로 여유가 없다.
 *
 * 그래서 순위로 바꿨다: 거리 내림차순으로 **띠를 균등 분배**한다. 띠는 등간격이라 절대
 * 겹치지 않고(3개일 때 56px), 순위가 거리로 정해지므로 "멀리 던진 게 위"는 그대로다.
 * 지면에서 읽히는 건 "누가 더 높나"지 "정확히 몇 미터만큼 높나"가 아니라, 순위로 충분하다.
 *
 * 위아래 끝은 남긴다(18~82%): 0%면 얼굴이 잘리고 100%면 배너가 경계선에 걸린다.
 */
function skyTops(dists: (number | null)[]): number[] {
  const n = dists.length;
  if (n === 1) return [50];

  // 고도 내림차순 순위. 안 던진 것(null)은 flyAltitude가 0.5로 보내 중간 순위가 된다
  // — 바닥에 두면 벌처럼, 꼭대기에 두면 던질 이유가 없어 보인다.
  const ranked = dists
    .map((d, i) => ({ i, alt: flyAltitude(d) }))
    .sort((a, b) => b.alt - a.alt);

  const tops = new Array<number>(n);
  ranked.forEach((o, rank) => {
    tops[o.i] = 18 + rank * (64 / (n - 1));
  });
  return tops;
}

/**
 * 하늘 한마디 — 한마디를 날린 사람의 얼굴이 배너를 끌고 지면을 가로지른다.
 *
 * 기강이야기 상단(기상대 바로 아래)에 놓인다. "날아가는 글씨는 못 읽는다"는 문제를
 * 해변 광고비행기 방식(비행체가 배너를 견인)으로 푼다. 오른쪽에서 왼쪽으로 난다.
 *
 * 견인하는 건 **사람 얼굴**이다. 종이비행기 그림을 쓰다가 걷어냈다 — 그림에 얼굴을
 * 얹으면 스티커를 붙인 것처럼 겉돌고, 접힌 면에 사진을 넣으면 납작한 날개가 얼굴을
 * 가로 띠로 잘라 누군지 알 수 없었다. 크루원은 서로 얼굴을 아니까 얼굴이 곧 서명이다.
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
 * `prefers-reduced-motion`이면 CSS가 얼굴을 제자리에 세운다.
 */
export function MessagePlanes({
  messages,
  teamId,
  myMemId,
  me,
}: {
  /** 서버 한마디 — 24시간 이내, crt_at 최신순. RPC가 만료분을 이미 걸러 준다 */
  messages: StoryMessage[];
  /** Realtime 채널 스코프 */
  teamId: string;
  /** 로그인 사용자 — 없으면 "날리기" 버튼을 감춘다. 구독은 로그인 여부와 무관하게 본다 */
  myMemId: string | null;
  /** 로그인 사용자 표시정보 — 던지기 무대에서 날아갈 얼굴 */
  me: { id: string; name: string; avatarUrl: string | null } | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

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

  // 고도는 뜬 것들끼리의 상대 순위라 목록 전체를 보고 한 번에 정한다(§skyTops)
  const tops = skyTops(flying.map((m) => m.fly_dist));

  /**
   * 던지는 중인 한마디 — null이면 무대가 닫혀 있다.
   *
   * 무대의 주인이 하늘인 이유: 던지기는 **이 하늘 안에서** 일어난다. 입력창 쪽에서 열면
   * 전체화면이거나 입력창 위에 뜨는 별도 판이 되어 "쓴 걸 저 하늘로 뿌린다"가 깨진다.
   */
  const [throwing, setThrowing] = useState<{ msgId: string; text: string } | null>(
    null,
  );

  /**
   * 던지기 종료 — 거리가 있으면 남기고, 없으면 조용히 닫는다.
   *
   * 대상 한마디를 클로저가 아니라 **ref**에서 꺼낸다. state를 클로저로 읽으면 이 콜백이
   * 거기 의존하게 되고, 그러면 던지는 도중 값이 바뀔 때마다 콜백이 새로 만들어져 진행 중인
   * 연출의 타이머가 끊긴다(React Compiler도 이 의존성 불일치를 에러로 잡는다).
   * setter 콜백 안에서 처리하는 방법도 있지만, 거기서 서버 호출을 띄우면 StrictMode의
   * 이중 호출에 두 번 나갈 수 있어 ref가 안전하다.
   */
  const throwingRef = useRef<{ msgId: string; text: string } | null>(null);
  const handleThrowDone = useCallback(
    (dist: number | null) => {
      const t = throwingRef.current;
      throwingRef.current = null;
      setThrowing(null);
      if (!t || dist == null) return;

      void (async () => {
        // 실패해도 조용하다 — 거리는 놀이의 부산물이고 한마디는 이미 하늘에 있다.
        const r = await setFlyDist({ msgId: t.msgId, dist });
        if (r.ok) router.refresh();
      })();
    },
    [router],
  );

  /** 하늘로 넘어온 한마디를 무대에 올린다 — state와 ref를 같이 세운다 */
  const handleThrow = useCallback((msg: { msgId: string; text: string }) => {
    throwingRef.current = msg;
    setThrowing(msg);
  }, []);

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
      <StoryZoneHeader
        bleed
        label="Sky Notes"
        lead={
          hasMessages
            ? "기강인들이 날린 한마디 — 하루가 지나면 사라져요"
            : "하늘이 아직 비어 있어요 — 첫 한마디를 날려보세요"
        }
        action={
          <HelpTip title="종이비행기 한마디">
            지금 하고 싶은 말을 종이비행기에 실어 날립니다. 24시간이 지나면 사라져요.
            날릴 때 멀리 던질수록 하늘 높이 뜹니다.
          </HelpTip>
        }
      />

      {/* 하늘 — 지면 위 여백을 비행 구역으로 쓴다. 잘라내야 화면 밖에서 들어오는 게 자연스럽다.
          던지는 동안에만 세로로 늘어난다(h-44 → h-64): 좁으면 손가락이 벽에 막혀 속도가
          안 붙는데, 늘 넓게 두면 평소 지면이 비어 보인다. 높이만 바뀌므로 transition으로
          부드럽게 — 갑자기 늘면 아래 존이 튄다. */}
      <div
        className={cn(
          "newsprint relative mt-4 overflow-hidden border-y border-border transition-[height] duration-300",
          throwing ? "h-64" : "h-44",
        )}
      >
        {/* 떠 있는 한마디는 누르는 대상이 아니다 — 배너를 읽으라고 띄우는 것뿐이다.
            그래서 button이 아니라 div다. */}
        {flying.map((m, i) => (
          <div
            key={m.msg_id}
            style={
              {
                // 고도 = 던진 거리 순위. 멀리 던진 한마디가 더 높이 난다 — 랭킹표를
                // 세우지 않고도 지면만 보면 누가 잘 던졌는지 읽힌다(§skyTops).
                top: `${tops[i]}%`,
                animationDuration: `${16 + i * 5}s`,
                animationDelay: `${i * -6}s`,
              } as CSSProperties
            }
            className="pledge-fly absolute left-0 flex -translate-y-1/2 items-center gap-2"
          >
            {/* 날린 사람 본인이 배너를 끌고 난다 — 크루원은 서로 얼굴을 아니까
                배너의 이름보다 얼굴이 먼저 읽힌다(글자는 지나가지만 얼굴은 한눈에 들어온다). */}
            <SkyFace
              size="md"
              rider={{
                memId: m.mem_id,
                memNm: m.mem_nm,
                avatarUrl: m.avatar_url,
              }}
            />
            {/* 견인 배너 — 얼굴 뒤(오른쪽)에 끌린다. 텍스트는 실제 텍스트라 스크린리더가 읽는다 */}
            <span className="whitespace-nowrap rounded-sm border border-border bg-background/85 px-2 py-1 text-[12px] text-foreground shadow-sm backdrop-blur-[1px]">
              {m.msg_txt}
              <span className="pl-1.5 text-[10px] text-muted-foreground">
                — {m.mem_nm}
              </span>
              {/* 던진 거리 — 고도로도 보이지만 숫자가 있어야 "얼마나"가 확정된다.
                  안 던진 한마디엔 아무것도 붙이지 않는다(빈 자리가 벌처럼 보이지 않게). */}
              {m.fly_dist != null && (
                <span className="pl-1.5 font-numeric text-[10px] text-foreground/70 tabular-nums">
                  {formatFlyDist(m.fly_dist)}
                </span>
              )}
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

        {!hasMessages && !throwing && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
            아직 아무도 날리지 않았어요
          </p>
        )}

        {/* 던지기 — 이 하늘 안에서 일어난다. 방금 쓴 한마디를 손가락으로 끌다 휙 뿌린다.
            떠 있는 배너들 위에 겹치므로(z-20) 던지는 동안엔 그것들이 배경이 된다. */}
        {throwing && me && (
          <ThrowStage
            rider={{ memId: me.id, memNm: me.name, avatarUrl: me.avatarUrl }}
            msgTxt={throwing.text}
            onDone={handleThrowDone}
          />
        )}
      </div>

      {/* 한마디 입력 — 로그인 멤버만. 비로그인에겐 감춘다(응원·내역과 동일 정책).
          다이얼로그가 아니라 지면에 바로 놓인다 — 한 줄 쓰는 데 모달 한 단계는 과하고,
          입력창 옆 버튼을 누르는 것 자체가 "날린다"는 동작이 된다. */}
      {myMemId && (
        <div className="mt-5">
          {/* 저장이 끝나면 하늘로 넘긴다 — 던지기 무대는 위 하늘이 연다.
              `me`가 없으면(표시정보 미상) 무대를 못 여니 넘기지 않는다. */}
          <MessageCompose onThrow={me ? handleThrow : undefined} />
        </div>
      )}
    </section>
  );
}
