"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dayjs, secondsToTime } from "@/lib/dayjs";
import { getRaceDday, getRecordLabel } from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { StoryReactionButton } from "@/components/story/story-reaction-button";

import { dedupePledgesByMember } from "@/lib/story-pledge";
import { reactionKey } from "@/lib/story-reaction";

import type { PointerEvent } from "react";
import type {
  RctnCd,
  StoryEntityType,
  StoryFeed,
  StoryRecord,
  StoryReactionCounts,
} from "@/lib/queries/story-feed";

/** 자동 전환 간격 — 한 장씩, 끝에 닿으면 처음으로 되돌아온다 */
const ROTATE_MS = 5000;
/** 손이 닿으면 이만큼 멈춘다. 이후 반응이 없으면 다시 자동으로 넘어간다 */
const PAUSE_MS = 10000;
/** 새 얼굴 슬롯이 다루는 기간 */
const WINDOW_DAYS = 30;
/**
 * 기록 슬롯이 다루는 기간 — **가장 최근 대회일로부터** N일.
 *
 * 오늘 기준이 아니라 최근 대회일 기준인 게 핵심이다: 대회가 뜸한 시기엔 오늘 기준 창이
 * 통째로 비어 기록 칸이 사라진다. 7일이면 토/일로 갈린 주말 대회나 격주 대회가 한 풀에
 * 들어와 인원 풀이 넉넉해진다(3일이면 뜸할 때 1~2명으로 줄어 랜덤 효과가 사라진다).
 */
const RECORD_WINDOW_DAYS = 7;
/** 기록 칸에 한 번에 싣는 건수 */
const RECORD_PICKS = 2;
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
  /**
   * 기록 칸 전용 — 한 칸에 여러 건을 나란히 싣는다.
   * 이게 있으면 헤드라인/아바타 대신 이 목록을 그린다(§③).
   */
  records?: RecordLine[];
};

/** 기록 칸의 한 줄 — 사람 · 종목 · 기록 */
type RecordLine = {
  entityId: string;
  person: Person;
  /** "하프", "10K" 등 종목 라벨 */
  label: string;
  /** 대회명 · 날짜 */
  sub: string;
  /** 완주 기록 */
  time: string;
};

/** 오늘 기준 N일 이내인가 (KST) */
function withinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const diff = dayjs().startOf("day").diff(dayjs(dateStr).startOf("day"), "day");
  return diff >= 0 && diff <= days;
}

/**
 * 기록 풀 — **가장 최근 대회일로부터** 7일 안에 열린 대회의 기록 전부.
 *
 * 기준일을 오늘이 아니라 최근 대회일로 잡는 이유: 대회가 2주 없으면 오늘 기준 7일 창은
 * 통째로 비어 기록 칸이 사라진다. "가장 최근 대회 + 그 언저리"로 잡으면 지면이 비지 않으면서
 * 토/일로 갈린 주말 대회가 한 풀에 들어온다.
 *
 * `feed.records`는 RPC가 최신순으로 주지만 여기서 순서에 기대지 않고 최대 날짜를 직접 구한다
 * — 정렬 기준이 등록일로 바뀌어도 창이 어긋나지 않도록.
 */
function pickRecordPool(records: StoryRecord[]): StoryRecord[] {
  const dated = records.filter((r) => r.race_dt);
  if (dated.length === 0) return [];

  const latest = dated.reduce(
    (max, r) => (r.race_dt! > max ? r.race_dt! : max),
    dated[0].race_dt!,
  );
  const floor = dayjs(latest).subtract(RECORD_WINDOW_DAYS, "day");

  return dated.filter((r) => !dayjs(r.race_dt!).isBefore(floor, "day"));
}

/**
 * 배열을 n칸 회전시킨다 — 원소를 지우지 않고 시작점만 옮긴다.
 *
 * 매번 새로 셔플하지 않는 이유: 셔플이면 같은 사람이 연속으로 뽑히거나 누군가는 몇 바퀴를
 * 돌아도 안 나올 수 있다. 회전은 한 바퀴에 모두가 정확히 한 번씩 대표가 되는 걸 보장한다
 * — "몰려 올라온 날 안 보이는 사람이 생기지 않게"라는 게 애초의 목적이므로.
 */
function rotate<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return arr;
  const at = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(at), ...arr.slice(0, at)];
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
function buildLedes(
  feed: StoryFeed,
  reactions: StoryReactionCounts,
  /** 각오 칸에 실을 인덱스 — 호출자가 마운트 후 굴린다(§⑤) */
  pledgePick: number,
  /** 기록 칸의 회전량 — 같은 이유로 호출자가 굴린다(§③) */
  recordPick: number,
): Lede[] {
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

  // ③ 기록 — 가장 최근 대회일로부터 7일 안의 기록을 한 풀로 묶고, 그 안에서 2건을 싣는다.
  //
  //    최신순 고정으로 뽑으면 대회 하나에 20명이 몰린 날 그 대회 상위 2건만 며칠씩 붙박이가
  //    되고 나머지 18명은 지면에 한 번도 못 오른다. 그래서 같은 창 안에서는 순서를 굴려
  //    전환할 때마다 다른 사람이 올라오게 한다(각오 칸과 같은 방식 — `recordPick`).
  const recPool = pickRecordPool(feed.records);
  if (recPool.length > 0) {
    const picked = rotate(recPool, recordPick).slice(0, RECORD_PICKS);
    const lines: RecordLine[] = picked.map((r) => ({
      entityId: r.entity_id,
      person: r,
      label: getRecordLabel({
        sport: r.sport,
        evt: r.evt,
        rec_time_sec: r.rec_time_sec,
        race_nm: r.race_nm,
        race_dt: r.race_dt,
      }),
      sub: [r.race_nm, r.race_dt ? dayjs(r.race_dt).format("M월 D일") : null]
        .filter(Boolean)
        .join(" · "),
      time: secondsToTime(r.rec_time_sec),
    }));

    ledes.push({
      // 키에 뽑힌 항목을 담아, 굴릴 때마다 `lede-in` 등장 모션이 다시 걸리게 한다.
      key: `record-${lines.map((l) => l.entityId).join("-")}`,
      kicker: "기록",
      // 여러 건을 싣는 칸이라 응원 버튼은 붙이지 않는다 — 버튼 하나가 어느 기록을
      // 가리키는지 알 수 없어서다(단건일 때만 성립하던 장치).
      entity: null,
      people: [],
      subs: [],
      moreCount: Math.max(0, recPool.length - RECORD_PICKS),
      headline: "",
      standfirst:
        recPool.length > RECORD_PICKS
          ? `최근 대회 ${recPool.length}건의 기록 중에서`
          : "최근 대회에서 나온 기록",
      figure: null,
      figureLabel: null,
      records: lines,
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

  // ⑤ 각오 — 존재하는 각오 중 **하나만** 싣는다. 헤드라인이 곧 각오 문장이다(따옴표로 인용).
  //    레일(다른 사람 얼굴)은 두지 않는다: 이 칸은 "누가 썼나"가 아니라 각오 한 문장을 읽히는
  //    자리고, 얼굴을 늘어세우면 문장이 아니라 명단으로 읽힌다.
  //    어느 각오를 고를지는 호출자가 정한다(`pledgePick`) — 여기서 Math.random()을 쓰면
  //    서버와 클라이언트가 다른 각오를 골라 하이드레이션이 깨진다.
  const pledgePool = dedupePledgesByMember(feed.pledges);
  const pledgeLead = pledgePool[pledgePick % Math.max(pledgePool.length, 1)];
  if (pledgeLead) {
    ledes.push({
      key: `pledge-${pledgeLead.pldg_id}`,
      kicker: "각오",
      entity: null,
      people: [pledgeLead],
      subs: [],
      moreCount: 0,
      headline: `“${pledgeLead.pldg_txt}”`,
      standfirst: `${pledgeLead.mem_nm}, 각오를 접어 날리다`,
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
  // 각오 칸에 실을 각오 — 자동 전환이 한 바퀴 돌 때마다 갈린다(아래 타이머).
  // 초기값을 0으로 고정하는 게 핵심이다: 렌더 중에 Math.random()을 부르면 서버와
  // 클라이언트가 다른 각오를 골라 하이드레이션이 깨진다. 굴리는 건 타이머 콜백 안에서만.
  const [pledgePick, setPledgePick] = useState(0);
  // 기록 칸 회전량 — 각오와 같은 이유로 0에서 출발한다(서버·클라 첫 렌더가 같아야 한다).
  // 굴리는 건 자동 전환 타이머 안에서만.
  const [recordPick, setRecordPick] = useState(0);
  const ledes = buildLedes(feed, reactions, pledgePick, recordPick);
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
      // 각오 칸이 다시 돌아올 때 같은 각오면 지면이 고여 보인다 — 넘길 때마다 굴려 둔다.
      // 인덱스는 `buildLedes`가 목록 길이로 나눠 쓰므로 계속 키워도 안전하다.
      setPledgePick((n) => n + 1 + Math.floor(Math.random() * 3));
      // 기록 칸도 같이 굴린다. 한 번에 2건을 싣고 있으니 2씩 밀어야 다음 바퀴에
      // 방금 본 사람이 또 나오지 않고 풀 전체를 순서대로 훑는다.
      setRecordPick((n) => n + RECORD_PICKS);
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

          {/* 기록 칸 — 한 칸에 두 건이라 헤드라인 하나로는 담기지 않는다.
              대신 사람마다 한 덩이(이름·종목 / 대회·날짜 / 기록)로 세워 나란히 읽힌다.
              두 건이 같은 무게라 어느 쪽도 주인공이 아니어야 하므로 크기를 맞춘다. */}
          {lede.records ? (
            <ul className="flex flex-col gap-3">
              {lede.records.map((r) => (
                <li key={r.entityId} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectMember(r.person.mem_id, r.person.mem_nm)}
                    aria-label={`${r.person.mem_nm} 프로필 보기`}
                    className="shrink-0 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                  >
                    <Avatar
                      src={r.person.avatar_url}
                      seed={r.person.mem_id}
                      alt={r.person.mem_nm}
                      size="md"
                    />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-serif text-[17px] leading-tight text-foreground">
                      {r.person.mem_nm}, {r.label}
                    </span>
                    {r.sub && (
                      <span className="truncate pt-0.5 text-[11px] text-muted-foreground">
                        {r.sub}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 font-numeric text-[19px] font-medium leading-none text-foreground tabular-nums">
                    {r.time}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            /* 각오처럼 띄어쓰기 없는 긴 문자열도 넘치지 않게 — break-keep(어절 유지)만으론
               연속 문자를 못 끊으니 overflow-wrap:anywhere를 더하고, 최대 3줄로 말줄임한다. */
            <h2 className="line-clamp-3 text-pretty break-keep font-serif text-[26px] font-normal leading-[1.28] text-foreground [overflow-wrap:anywhere]">
              {lede.headline}
            </h2>
          )}

          <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
            {lede.standfirst}
          </p>

          {/* 아바타·수치 줄 — 기록 칸은 사람과 기록을 이미 목록 안에 품고 있어 이 줄이
              통째로 비고, 빈 flex가 gap만 남겨 리드문 아래에 헛간격이 생긴다. */}
          {(lede.people.length > 0 || lede.figure) && (
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
          )}

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
