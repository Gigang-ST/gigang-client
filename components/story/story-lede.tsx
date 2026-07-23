"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dayjs, secondsToTime } from "@/lib/dayjs";
import { getRaceDday, getRecordLabel } from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { StoryReactionButton } from "@/components/story/story-reaction-button";

import { reactionKey } from "@/lib/story-reaction";

import type { PointerEvent } from "react";
import type {
  RctnCd,
  StoryEntityType,
  StoryFeed,
  StoryReactionCounts,
} from "@/lib/queries/story-feed";

/** 자동 전환 간격 — 한 장씩, 끝에 닿으면 처음으로 되돌아온다 */
const ROTATE_MS = 5000;
/** 손이 닿으면 이만큼 멈춘다. 이후 반응이 없으면 다시 자동으로 넘어간다 */
const PAUSE_MS = 10000;
/** 새 얼굴·기록 슬롯이 다루는 기간 */
const WINDOW_DAYS = 30;
/** 우측 레일에 얼굴을 몇 개까지 세울지. 나머지는 "외 N명" */
const MAX_SUBS = 3;

type Person = { mem_id: string; mem_nm: string; avatar_url: string | null };

type Lede = {
  key: string;
  /** 기사 분류 — 신문의 어깨제목 */
  kicker: string;
  entity: {
    type: "newbie" | "record" | "race";
    id: string;
    rctnCd: RctnCd;
    count: number;
    /** 내가 이 항목에 누른 누적 횟수 — 점등·상한 판정용 */
    myCount: number;
  } | null;
  /** 좌측 메인 — 대회처럼 주인공이 여럿이면 겹쳐 쌓는다 */
  people: Person[];
  /** 우측 레일 — 대표 말고 나머지 사람들. 아무도 빠뜨리지 않기 위한 자리 */
  subs: Person[];
  /** 레일에도 못 들어간 인원 수 */
  moreCount: number;
  /** 명조 헤드라인 — 기사 제목 */
  headline: string;
  /** 헤드라인 아래 리드문 한 줄 */
  standfirst: string;
  /** 우측 수치 (기록·D-day·횟수) */
  figure: string | null;
  figureLabel: string | null;
};

/** 오늘 기준 N일 이내인가 (KST) */
function withinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const diff = dayjs().startOf("day").diff(dayjs(dateStr).startOf("day"), "day");
  return diff >= 0 && diff <= days;
}

/**
 * 피드 → 리드 기사 목록.
 *
 * **한 종류당 한 칸이다.** 신규 멤버가 넷이라고 네 칸을 쓰면 스와이프가 명단 낭독이 된다.
 * 대신 가장 최근 한 명(한 건)을 대표로 크게 싣고, 나머지는 우측 레일에 작게 세운다 —
 * 지면에서 빠지는 사람이 없게. 레일의 얼굴도 탭하면 각자의 카드가 열린다.
 *
 * 순서는 시의성: 임박한 대회 → 새 얼굴 → 기록 → 이달의 참가왕.
 */
function buildLedes(feed: StoryFeed, reactions: StoryReactionCounts): Lede[] {
  const ledes: Lede[] = [];

  /**
   * 리액션 항목 하나의 카운트를 최신 집계로 보정한다.
   *
   * 피드 캐시(rctn_count)는 최대 5분 지연이라 남이 누른 것도, 내가 방금 누른 것도 늦게 잡힌다.
   * 그래서 총합(count)은 캐시 대신 최신 집계(reactions.totals)를, 내 몫(myCount)은 reactions.mine을
   * 쓴다 — 모두의 응원이 실시간에 가깝게 쌓여 보이고, 새로고침해도 내 몫이 유지된다.
   * 집계에 아직 안 잡힌 극히 짧은 순간을 위해 캐시값을 하한으로 둔다.
   */
  const buildEntity = (
    type: StoryEntityType,
    id: string,
    rctnCd: RctnCd,
    cachedCount: number,
  ): Lede["entity"] => {
    const key = reactionKey(type, id);
    const total = reactions.totals[key] ?? 0;
    return {
      type,
      id,
      rctnCd,
      count: Math.max(cachedCount, total),
      myCount: reactions.mine[key] ?? 0,
    };
  };

  // ① 다가오는 대회 — 가장 임박한 1건만. 출전자는 겹친 아바타로 함께 보여준다.
  const race = feed.races.find((r) => getRaceDday(r.stt_dt));
  if (race) {
    ledes.push({
      key: `race-${race.entity_id}`,
      kicker: "다가오는 대회",
      entity: buildEntity("race", race.entity_id, race.rctn_cd, race.rctn_count),
      people: race.runners.slice(0, 4),
      subs: [],
      moreCount: Math.max(0, race.reg_cnt - 4),
      headline: race.comp_nm,
      standfirst: `${dayjs(race.stt_dt).format("M월 D일")}, 기강인 ${race.reg_cnt}명이 출발선에 선다`,
      figure: getRaceDday(race.stt_dt),
      figureLabel: null,
    });
  }

  // ② 새 얼굴 — 최근 30일. 가장 최근 1명이 대표, 나머지는 레일.
  const newbies = feed.newbies.filter((n) => withinDays(n.event_at, WINDOW_DAYS));
  const [newbieLead, ...restNewbies] = newbies;
  if (newbieLead) {
    ledes.push({
      key: `newbie-${newbieLead.entity_id}`,
      kicker: "새 얼굴",
      entity: buildEntity(
        "newbie",
        newbieLead.entity_id,
        newbieLead.rctn_cd,
        newbieLead.rctn_count,
      ),
      people: [newbieLead],
      subs: restNewbies.slice(0, MAX_SUBS),
      moreCount: Math.max(0, restNewbies.length - MAX_SUBS),
      headline: `${newbieLead.mem_nm}, 기강에 합류하다`,
      standfirst:
        restNewbies.length > 0
          ? `${dayjs(newbieLead.event_at).format("M월 D일")} 합류 · 최근 한 달 새 얼굴 ${newbies.length}명`
          : `${dayjs(newbieLead.event_at).format("M월 D일")}부터 함께 달립니다`,
      figure: null,
      figureLabel: null,
    });
  }

  // ③ 기록 — 최근 30일. 가장 최근 1건이 대표, 나머지는 레일.
  const recs = feed.records.filter((r) => withinDays(r.race_dt, WINDOW_DAYS));
  const [recLead, ...restRecs] = recs;
  if (recLead) {
    const label = getRecordLabel({
      sport: recLead.sport,
      evt: recLead.evt,
      rec_time_sec: recLead.rec_time_sec,
      race_nm: recLead.race_nm,
      race_dt: recLead.race_dt,
    });
    ledes.push({
      key: `record-${recLead.entity_id}`,
      kicker: "기록",
      entity: buildEntity(
        "record",
        recLead.entity_id,
        recLead.rctn_cd,
        recLead.rctn_count,
      ),
      people: [recLead],
      subs: restRecs.slice(0, MAX_SUBS),
      moreCount: Math.max(0, restRecs.length - MAX_SUBS),
      headline: `${recLead.mem_nm}, ${label}를 완주하다`,
      standfirst: [recLead.race_nm, dayjs(recLead.race_dt).format("M월 D일")]
        .filter(Boolean)
        .join(" · "),
      figure: secondsToTime(recLead.rec_time_sec),
      figureLabel: label,
    });
  }

  // ④ 이달의 참가왕 — 하단 섹션에서 뺐으므로 여기가 유일한 자리다.
  const king = feed.month_rank[0];
  if (king) {
    ledes.push({
      key: `king-${king.mem_id}`,
      kicker: `${dayjs().format("M월")} 참가왕`,
      entity: null,
      people: [king],
      subs: feed.month_rank.slice(1, 1 + MAX_SUBS),
      moreCount: 0,
      headline: `${king.mem_nm}, 이번 달 가장 많이 나오다`,
      standfirst: "모임 참석 1위",
      figure: String(king.attd_cnt),
      figureLabel: "회 참석",
    });
  }

  // ⑤ 각오 — 가장 최근 1건이 대표, 나머지는 레일. 헤드라인이 곧 각오 문장이다(따옴표로 인용).
  //    Math.random()은 SSR/CSR 불일치를 부르므로 쓰지 않는다 — "최근순" 그대로 대표를 고른다.
  const [pledgeLead, ...restPledges] = feed.pledges;
  if (pledgeLead) {
    // 레일은 "얼굴"을 세우는 자리라 사람 기준으로 유니크해야 한다 — 한 사람이 각오를 여러 개
    // 써도 레일엔 한 번만. (대표와 같은 사람도 제외) 이걸 안 하면 mem_id key가 겹쳐 React가 터진다.
    const seen = new Set<string>([pledgeLead.mem_id]);
    const railPeople = restPledges.filter((p) => {
      if (seen.has(p.mem_id)) return false;
      seen.add(p.mem_id);
      return true;
    });
    ledes.push({
      key: `pledge-${pledgeLead.pldg_id}`,
      kicker: "각오",
      entity: null,
      people: [pledgeLead],
      subs: railPeople.slice(0, MAX_SUBS),
      moreCount: Math.max(0, railPeople.length - MAX_SUBS),
      headline: `“${pledgeLead.pldg_txt}”`,
      standfirst: `${pledgeLead.mem_nm}, 코스에 각오를 꽂다`,
      figure: null,
      figureLabel: null,
    });
  }

  return ledes;
}

/**
 * 1면 리드 기사 — 한 번에 한 건, 3초마다 다음 기사로 넘어가고 마지막 다음은 처음이다.
 *
 * 스크롤 컨테이너 대신 인덱스 상태로 한 장만 그린다. 스와이프 한 번에 정확히 한 칸씩
 * 움직여야 해서(관성 스크롤은 여러 칸을 건너뛴다) 포인터 제스처를 직접 읽는다.
 *
 * 사용자가 직접 넘기면 10초 멈춘다 — 읽는 중에 바뀌는 게 가장 거슬리므로. 다만 영영
 * 멈추면 한 번 만진 뒤로는 전광판이 죽은 화면이 되므로, 반응이 없으면 자동 전환을 되살린다.
 */
export function StoryLede({
  feed,
  reactions,
  onSelectMember,
}: {
  feed: StoryFeed;
  /** 응원 집계 (모두의 총합 + 내 몫) — 응원 버튼 카운트 보정용 */
  reactions: StoryReactionCounts;
  onSelectMember: (memId: string, name: string) => void;
}) {
  const ledes = buildLedes(feed, reactions);
  const total = ledes.length;

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const resumeTimerRef = useRef<number | null>(null);

  /** 손이 닿았다 — 잠시 멈추고, 조용해지면 다시 돈다 */
  const pauseThenResume = useCallback(() => {
    setPaused(true);
    if (resumeTimerRef.current !== null)
      window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => setPaused(false), PAUSE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current !== null)
        window.clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (total === 0) return;
      setActive((i) => (i + dir + total) % total);
    },
    [total],
  );

  useEffect(() => {
    if (paused || total <= 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setActive((i) => (i + 1) % total);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [paused, total]);

  if (total === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-serif text-[19px] text-foreground">
          오늘은 전할 소식이 없습니다
        </p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          모임에 나가거나 기록을 남기면 이 자리에 실립니다.
        </p>
      </div>
    );
  }

  const lede = ledes[active];

  /** 스와이프 — 가로 이동이 세로보다 크고 40px 넘으면 한 칸 */
  function handlePointerUp(e: PointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    pauseThenResume();
    go(dx < 0 ? 1 : -1);
  }

  return (
    <section
      aria-label="오늘의 기강"
      onPointerDown={(e) => {
        dragStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragStart.current = null;
      }}
      className="touch-pan-y select-none px-6"
    >
      {/* 슬롯마다 내용 높이가 달라 자동 전환·스와이프 때 지면이 출렁인다.
          가장 큰 슬롯(대회: 헤드라인 2줄 + 아바타 + 응원 버튼)에 맞춰 넉넉히 고정한다. */}
      <div
        key={lede.key}
        className="lede-in flex min-h-[248px] items-start gap-3"
      >
        <article className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="font-numeric text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {lede.kicker}
          </span>

          {/* 각오처럼 띄어쓰기 없는 긴 문자열도 넘치지 않게 — break-keep(어절 유지)만으론
              연속 문자를 못 끊으니 overflow-wrap:anywhere를 더하고, 최대 3줄로 말줄임한다. */}
          <h2 className="line-clamp-3 text-pretty break-keep font-serif text-[26px] font-normal leading-[1.28] text-foreground [overflow-wrap:anywhere]">
            {lede.headline}
          </h2>

          <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
            {lede.standfirst}
          </p>

          <div className="flex items-center gap-3 pt-0.5">
            <div className="flex shrink-0">
              {lede.people.map((p, i) => (
                <button
                  key={p.mem_id}
                  type="button"
                  onClick={() => onSelectMember(p.mem_id, p.mem_nm)}
                  aria-label={`${p.mem_nm} 프로필 보기`}
                  className={cn(
                    "rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                    i > 0 && "-ml-2.5",
                    lede.people.length > 1 && "ring-2 ring-background",
                  )}
                >
                  <Avatar
                    src={p.avatar_url}
                    seed={p.mem_id}
                    alt={p.mem_nm}
                    size={lede.people.length > 1 ? "sm" : "lg"}
                  />
                </button>
              ))}
              {lede.people.length > 1 && lede.moreCount > 0 && (
                <span className="ml-1.5 self-center font-numeric text-[11px] text-muted-foreground tabular-nums">
                  외 {lede.moreCount}
                </span>
              )}
            </div>

            {lede.figure && (
              <div className="ml-auto flex shrink-0 flex-col items-end">
                <span className="font-numeric text-[27px] font-medium leading-none text-foreground tabular-nums">
                  {lede.figure}
                </span>
                {lede.figureLabel && (
                  <span className="mt-1 text-[11px] text-muted-foreground">
                    {lede.figureLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {lede.entity && (
            <div className="pt-1">
              <StoryReactionButton
                entityType={lede.entity.type}
                entityId={lede.entity.id}
                rctnCd={lede.entity.rctnCd}
                initialCount={lede.entity.count}
                initialMyCount={lede.entity.myCount}
              />
            </div>
          )}
        </article>

        {/* 우측 레일 — 신문의 사이드바. 세로 괘선으로 본문과 나눈다 */}
        {lede.subs.length > 0 && (
          <aside className="flex w-12 shrink-0 flex-col items-center gap-2.5 border-l border-border pl-2 pt-6">
            {lede.subs.map((s) => (
              <button
                key={s.mem_id}
                type="button"
                onClick={() => onSelectMember(s.mem_id, s.mem_nm)}
                aria-label={`${s.mem_nm} 프로필 보기`}
                className="flex w-full flex-col items-center gap-1 rounded transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
              >
                <Avatar
                  src={s.avatar_url}
                  seed={s.mem_id}
                  alt={s.mem_nm}
                  size="sm"
                />
                <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
                  {s.mem_nm}
                </span>
              </button>
            ))}
            {lede.moreCount > 0 && (
              <span className="font-numeric text-[10px] text-muted-foreground tabular-nums">
                외 {lede.moreCount}
              </span>
            )}
          </aside>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center gap-2 pt-5">
          {/* 진행 표시 — 신문 판형처럼 얇은 막대 */}
          {ledes.map((l, i) => (
            <button
              key={l.key}
              type="button"
              onClick={() => {
                pauseThenResume();
                setActive(i);
              }}
              aria-label={`${i + 1}번째 기사 보기`}
              aria-current={i === active}
              className="group flex-1 py-2 focus-visible:outline-none"
            >
              <span
                className={cn(
                  "block h-0.5 w-full transition-colors",
                  i === active
                    ? "bg-foreground"
                    : "bg-border group-hover:bg-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
      )}

      <span className="sr-only" role="status">
        {total}건 중 {active + 1}번째 기사
      </span>
    </section>
  );
}
