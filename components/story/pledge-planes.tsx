"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { floatPledge } from "@/app/actions/story/float-pledge";
import { dayjs } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { PledgeCreateDialog } from "@/components/story/pledge-create-dialog";

import type { StoryFloatPledge } from "@/lib/queries/story-pledges";
import type { CSSProperties } from "react";

/** 하늘에 동시에 띄우는 개수 — 넘기면 h-44 안에서 배너끼리 고도가 겹쳐 서로를 가린다 */
const SKY_SHOWN = 3;
/** 착륙장에 먼저 보여줄 개수 — 나머지는 더보기 */
const LANDED_INITIAL = 3;
/** 이륙 애니메이션 길이(ms) — globals.css의 .pledge-liftoff / .pledge-wipe와 맞춘다 */
const LIFTOFF_MS = 640;

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
 * 걸리는데, 비행/이륙 애니메이션의 `transform`은 **바깥 요소**에 걸어 서로 덮어쓰지 않게 한다.
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

/** 비행 시간 — float_at부터 지금까지 경과를 HH:MM:SS로. 사족 없이 시계만(초 단위로 흐른다) */
function floatClock(floatAt: string, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - new Date(floatAt).getTime()) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  // 며칠 떠 있으면 시(hour)가 24를 넘지만 그대로 누적 표기한다(예: 26:03:00) — 리셋은 이륙 때만
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * 종이비행기 각오 — 신문지를 접어 날린 비행기가 각오 배너를 끌고 지면을 가로지른다.
 *
 * 기강이야기 상단(기상대 바로 아래)에 놓인다. "날아가는 글씨는 못 읽는다"는 문제를
 * 해변 광고비행기 방식(비행기가 배너를 견인)으로 푼다. 오른쪽에서 왼쪽으로 난다.
 *
 * **하늘은 모두가 함께 보는 공유 편성이다.** 어느 각오가 떠 있는지는 서버의 `float_at`
 * 최신순으로 정해지고(누가 띄우면 그 각오의 float_at이 now가 돼 맨 앞에 선다), 열린 모든
 * 화면은 `pldg_mst` Realtime 구독으로 즉시 다시 그린다. 착륙장 항목의 비행기 버튼을 누르면
 * 그 각오가 이륙한다(하늘이 꽉 차면 가장 오래 떠 있던 게 내려앉는다) — **누구든 아무 각오나**
 * 띄울 수 있다(본인 것만이 아니다). 누른 사람 화면에서는 비행기가 왼쪽으로 날며 각오 문장을
 * 지우는 이륙 연출이 재생되고, 서버 반영은 낙관적으로 먼저 보여준 뒤 Realtime이 확정한다.
 *
 * 접근성: 날아다니는 배너는 움직이는 타깃이라 누르기 어렵다. 각오 전문을 `aria-label`에
 * 실어 열지 않고도 읽히게 하고, `prefers-reduced-motion`이면 CSS가 비행기를 제자리에 세운다.
 * 손이 닿지 않아도 잃는 건 없다 — 착륙장 목록이 같은 각오를 정지 상태로 다시 제공한다.
 */
export function PledgePlanes({
  pledges,
  teamId,
  myMemId,
  onSelectMember,
}: {
  /** 서버 각오 — 사람당 1건, float_at 최신순(공유 편성의 정본) */
  pledges: StoryFloatPledge[];
  /** Realtime 채널 스코프 */
  teamId: string;
  /** 로그인 사용자 — 없으면 "날리기" 버튼을 감춘다. 구독·이륙은 로그인 여부와 무관하게 본다 */
  myMemId: string | null;
  onSelectMember: (memId: string, name: string) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [writing, setWriting] = useState(false);
  const [landedOpen, setLandedOpen] = useState(false);
  /** 방금 내가 띄운 각오 — 서버 반영 전 낙관적으로 하늘 앞에 세운다(Realtime이 곧 확정) */
  const [liftedIds, setLiftedIds] = useState<string[]>([]);
  /** 이륙 연출 중인 각오 — 비행기가 날며 메시지를 지우는 LIFTOFF_MS 동안만 값. 그동안 착륙장에 남긴다 */
  const [liftingId, setLiftingId] = useState<string | null>(null);
  /** 떠 있은 시간 표시용 현재 시각 — 마운트 후에만 채운다(SSR/CSR 불일치 방지) */
  const [nowMs, setNowMs] = useState<number | null>(null);

  const hasPledges = pledges.length > 0;

  // 하늘 편성: ① 방금 내가 띄운 것 → ② 서버 float_at 순으로 채운다. 이륙 연출 중인 건 제외해
  // (아직 착륙장 행에서 날아가는 중) 애니메이션이 끝날 때까지 하늘로 올리지 않는다.
  const flying = useMemo(() => {
    const byId = new Map(pledges.map((p) => [p.pldg_id, p]));
    const picked: StoryFloatPledge[] = [];
    const seen = new Set<string>();
    const take = (p?: StoryFloatPledge) => {
      if (!p || seen.has(p.pldg_id) || p.pldg_id === liftingId) return;
      if (picked.length >= SKY_SHOWN) return;
      seen.add(p.pldg_id);
      picked.push(p);
    };
    for (const id of liftedIds) take(byId.get(id));
    for (const p of pledges) take(p);
    return picked;
  }, [pledges, liftedIds, liftingId]);

  const flyingIds = useMemo(() => new Set(flying.map((p) => p.pldg_id)), [flying]);
  // 착륙장 = 하늘에 없는 나머지(이륙 연출 중인 것도 여기 남아 애니메이션을 마친다)
  const landed = useMemo(
    () => pledges.filter((p) => !flyingIds.has(p.pldg_id)),
    [pledges, flyingIds],
  );
  const shownLanded = landedOpen ? landed : landed.slice(0, LANDED_INITIAL);
  const hiddenLanded = landed.length - LANDED_INITIAL;

  // 비행 시계는 1초마다 갱신 — HH:MM:SS의 초가 실제로 흐른다. flying/landed는 nowMs에 의존하지
  // 않아(useMemo) 재계산되지 않고, 매 초 바뀌는 건 시계 텍스트뿐이다(비행기 몇 개라 값싸다).
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

  // Realtime — 누가 각오를 쓰거나 띄우면 열린 모든 화면이 다시 그린다. 연속 이벤트는 350ms로 묶는다.
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => router.refresh(), 350);
  }, [router]);

  useEffect(() => {
    const channel = supabase
      .channel(`pledges:${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pldg_mst", filter: `team_id=eq.${teamId}` },
        () => scheduleRefresh(),
      )
      .subscribe();
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, teamId, scheduleRefresh]);

  /** 착륙장에서 이륙 — 서버에 float_at=now를 쓰고, 누른 화면에선 날아가는 연출을 재생한다 */
  const lift = (id: string) => {
    if (liftingId) return; // 한 번에 하나씩 — 연출이 겹치지 않게

    // 서버 반영은 즉시 발사(연출을 기다리지 않는다). 실패해도 화면은 Realtime/새로고침이 되돌린다.
    void floatPledge({ pldg_id: id }).then((r) => {
      if (!r.ok) toast.error(r.message);
    });

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // 모션 없이 바로 하늘로 — 연출 생략
      setLiftedIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, SKY_SHOWN));
      return;
    }

    // 연출 재생 → 끝나면 하늘로 올린다(그 전엔 착륙장 행에서 날아간다)
    setLiftingId(id);
    window.setTimeout(() => {
      setLiftedIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, SKY_SHOWN));
      setLiftingId(null);
    }, LIFTOFF_MS);
  };

  return (
    <section className="flex flex-col">
      <div className="rule-section mx-6 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Pledges
        </h2>
      </div>
      <p className="px-6 pt-2.5 font-serif text-[15px] text-muted-foreground">
        {hasPledges
          ? "기강인들이 날린 각오"
          : "하늘이 아직 비어 있어요 — 첫 각오를 날려보세요"}
      </p>

      {/* 하늘 — 지면 위 여백을 비행 구역으로 쓴다. 잘라내야 화면 밖에서 들어오는 게 자연스럽다 */}
      <div className="newsprint relative mt-4 h-44 overflow-hidden border-y border-border">
        {/* 떠 있는 각오는 누르는 대상이 아니다 — 배너를 읽으라고 띄우는 것뿐, 클릭은 착륙장이 받는다.
            그래서 button이 아니라 div다(프로필은 착륙장 아바타로 연다). */}
        {flying.map((p, i) => (
          <div
            key={p.pldg_id}
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
              {p.pldg_txt}
              <span className="pl-1.5 text-[10px] text-muted-foreground">
                — {p.mem_nm}
              </span>
              {nowMs !== null && (
                // 매초 바뀌는 시계라 스크린리더가 계속 읽지 않게 aria-hidden
                <span
                  aria-hidden
                  className="pl-2 font-numeric text-[10px] text-muted-foreground/70 tabular-nums"
                >
                  {floatClock(p.float_at, nowMs)}
                </span>
              )}
            </span>
          </div>
        ))}

        {!hasPledges && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
            아직 아무도 날리지 않았어요
          </p>
        )}
      </div>

      <div className="px-6">
        {/* 각오 날리기 — 로그인 멤버만. 비로그인에겐 버튼을 감춘다(응원·내역과 동일 정책) */}
        {myMemId && (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PaperPlane className="h-4" /> 각오 접어 날리기
          </button>
        )}

        {/* 착륙장 — 내려앉은 각오들. 비행기 버튼을 누르면 다시 이륙한다 */}
        {landed.length > 0 && (
          <>
            <div className="rule-section mt-7 pb-2">
              <h3 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
                착륙장
              </h3>
            </div>
            <ul className="flex flex-col pt-1">
              {shownLanded.map((p) => {
                const isLifting = liftingId === p.pldg_id;
                return (
                  <li
                    key={p.pldg_id}
                    // 이륙 중엔 비행기가 행을 가로질러 날아가므로, 왼쪽 밖으로 나가면 클립한다
                    className={cn("rule-row", isLifting && "relative overflow-hidden")}
                  >
                    <div className="flex items-center gap-3 py-2.5">
                      {/* 아바타는 32px라 손가락엔 작다 — 패딩으로 히트영역만 넓힌다 */}
                      <button
                        type="button"
                        onClick={() => onSelectMember(p.mem_id, p.mem_nm)}
                        aria-label={`${p.mem_nm} 프로필 보기`}
                        className="-m-1 shrink-0 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Avatar
                          src={p.avatar_url}
                          seed={p.mem_id}
                          alt={p.mem_nm}
                          size="sm"
                        />
                      </button>
                      {/* 각오 문장 — 이륙 시 비행기가 지나가며 오른쪽부터 지워진다 */}
                      <div
                        className={cn(
                          "flex min-w-0 flex-1 flex-col gap-0.5",
                          isLifting && "pledge-wipe",
                        )}
                      >
                        <span className="truncate font-serif text-[14px] text-foreground">
                          {p.pldg_txt}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {p.mem_nm} ·{" "}
                          <span className="font-numeric tabular-nums">
                            {dayjs(p.crt_at).format("M.DD")}
                          </span>
                        </span>
                      </div>
                      {/* 이륙 — 이 각오를 하늘로 올린다(누구든 아무 각오나) */}
                      <button
                        type="button"
                        onClick={() => lift(p.pldg_id)}
                        disabled={isLifting}
                        aria-label={`${p.mem_nm}의 각오 띄우기`}
                        title="띄우기"
                        className="relative z-10 -m-2 shrink-0 rounded p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                      >
                        {/* 이륙 애니메이션은 이 바깥 span의 transform에 건다 — PaperPlane 자신의
                            scaleX와 덮어쓰지 않게(각각 다른 요소) */}
                        <span className={cn("block", isLifting && "pledge-liftoff")}>
                          <PaperPlane className="h-[18px]" />
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {hiddenLanded > 0 && (
              <button
                type="button"
                onClick={() => setLandedOpen((v) => !v)}
                aria-expanded={landedOpen}
                className="mt-1 self-start py-2 font-numeric text-[11px] uppercase tracking-[0.14em] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {landedOpen ? "− 접기" : `+ ${hiddenLanded}건 더보기`}
              </button>
            )}
          </>
        )}
      </div>

      <PledgeCreateDialog open={writing} onOpenChange={setWriting} />
    </section>
  );
}
