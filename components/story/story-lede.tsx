"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dayjs, secondsToTime } from "@/lib/dayjs";
import { getRaceDday, getRecordLabel } from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { StoryReactionButton } from "@/components/story/story-reaction-button";

import type { PointerEvent } from "react";
import type { RctnCd, StoryFeed } from "@/lib/queries/story-feed";

/** 자동 전환 간격 — 한 장씩, 끝에 닿으면 처음으로 되돌아온다 */
const ROTATE_MS = 3000;

type Lede = {
  key: string;
  /** 기사 분류 — 신문의 어깨제목 */
  kicker: string;
  entity: {
    type: "newbie" | "record" | "race";
    id: string;
    rctnCd: RctnCd;
    count: number;
    mine: boolean;
  } | null;
  people: { mem_id: string; mem_nm: string; avatar_url: string | null }[];
  /** 명조 헤드라인 — 기사 제목 */
  headline: string;
  /** 헤드라인 아래 리드문 한 줄 */
  standfirst: string;
  /** 우측 수치 (기록·D-day·횟수) */
  figure: string | null;
  figureLabel: string | null;
};

/**
 * 피드 → 리드 기사 목록.
 *
 * 신문의 1면처럼 "지금 가장 큰 소식"만 올린다. 순서는 시의성:
 * 임박한 대회 → 기록 속보 → 새 얼굴 → 이달의 참가왕 → 활동지수 1위.
 */
function buildLedes(feed: StoryFeed): Lede[] {
  const ledes: Lede[] = [];

  for (const race of feed.races) {
    const dday = getRaceDday(race.stt_dt);
    if (!dday) continue;
    ledes.push({
      key: `race-${race.entity_id}`,
      kicker: "다가오는 대회",
      entity: {
        type: "race",
        id: race.entity_id,
        rctnCd: race.rctn_cd,
        count: race.rctn_count,
        mine: race.my_rctn === race.rctn_cd,
      },
      people: race.runners.slice(0, 5),
      headline: race.comp_nm,
      standfirst: `${dayjs(race.stt_dt).format("M월 D일")}, 기강인 ${race.reg_cnt}명이 출발선에 선다`,
      figure: dday,
      figureLabel: null,
    });
  }

  for (const rec of feed.records) {
    const label = getRecordLabel({
      sport: rec.sport,
      evt: rec.evt,
      rec_time_sec: rec.rec_time_sec,
      race_nm: rec.race_nm,
      race_dt: null,
    });
    ledes.push({
      key: `record-${rec.entity_id}`,
      kicker: "기록",
      entity: {
        type: "record",
        id: rec.entity_id,
        rctnCd: rec.rctn_cd,
        count: rec.rctn_count,
        mine: rec.my_rctn === rec.rctn_cd,
      },
      people: [
        { mem_id: rec.mem_id, mem_nm: rec.mem_nm, avatar_url: rec.avatar_url },
      ],
      headline: `${rec.mem_nm}, ${label}를 완주하다`,
      standfirst: rec.race_nm ?? "기강 러닝 기록",
      figure: secondsToTime(rec.rec_time_sec),
      figureLabel: label,
    });
  }

  for (const nb of feed.newbies) {
    ledes.push({
      key: `newbie-${nb.entity_id}`,
      kicker: "새 얼굴",
      entity: {
        type: "newbie",
        id: nb.entity_id,
        rctnCd: nb.rctn_cd,
        count: nb.rctn_count,
        mine: nb.my_rctn === nb.rctn_cd,
      },
      people: [
        { mem_id: nb.mem_id, mem_nm: nb.mem_nm, avatar_url: nb.avatar_url },
      ],
      headline: `${nb.mem_nm}, 기강에 합류하다`,
      standfirst: `${dayjs(nb.event_at).format("M월 D일")}부터 함께 달립니다`,
      figure: null,
      figureLabel: null,
    });
  }

  const king = feed.month_rank[0];
  if (king) {
    ledes.push({
      key: `king-${king.mem_id}`,
      kicker: `${dayjs().format("M월")} 참가왕`,
      entity: null,
      people: [
        { mem_id: king.mem_id, mem_nm: king.mem_nm, avatar_url: king.avatar_url },
      ],
      headline: `${king.mem_nm}, 이번 달 가장 많이 나오다`,
      standfirst: "모임 참석 1위",
      figure: String(king.attd_cnt),
      figureLabel: "회 참석",
    });
  }

  const top = feed.actv_rank[0];
  if (top) {
    ledes.push({
      key: `actv-${top.mem_id}`,
      kicker: "활동지수",
      entity: null,
      people: [
        { mem_id: top.mem_id, mem_nm: top.mem_nm, avatar_url: top.avatar_url },
      ],
      headline: `${top.mem_nm}, 활동지수 1위`,
      standfirst: "모임·대회를 통틀어 가장 부지런한 기강인",
      figure: top.actv_score.toLocaleString(),
      figureLabel: "활동지수",
    });
  }

  return ledes.slice(0, 8);
}

/**
 * 1면 리드 기사 — 한 번에 한 건, 3초마다 다음 기사로 넘어가고 마지막 다음은 처음이다.
 *
 * 스크롤 컨테이너 대신 인덱스 상태로 한 장만 그린다. 스와이프 한 번에 정확히 한 칸씩
 * 움직여야 해서(관성 스크롤은 여러 칸을 건너뛴다) 포인터 제스처를 직접 읽는다.
 * 사용자가 직접 넘기면 자동 전환을 멈춘다 — 읽는 중에 바뀌는 게 가장 거슬리므로.
 */
export function StoryLede({
  feed,
  onSelectMember,
}: {
  feed: StoryFeed;
  onSelectMember: (memId: string, name: string) => void;
}) {
  const ledes = buildLedes(feed);
  const total = ledes.length;

  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (total === 0) return;
      setActive((i) => (i + dir + total) % total);
    },
    [total],
  );

  useEffect(() => {
    if (manual || total <= 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setActive((i) => (i + 1) % total);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [manual, total]);

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
    setManual(true);
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
      <article key={lede.key} className="lede-in flex flex-col gap-3">
        <span className="font-numeric text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {lede.kicker}
        </span>

        <h2 className="text-balance font-serif text-[26px] font-normal leading-[1.28] text-foreground">
          {lede.headline}
        </h2>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
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
                  i > 0 && "-ml-2.5 ring-2 ring-background",
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
              initialMine={lede.entity.mine}
            />
          </div>
        )}
      </article>

      {total > 1 && (
        <div className="flex items-center gap-2 pt-5">
          {/* 진행 표시 — 신문 판형처럼 얇은 막대 */}
          {ledes.map((l, i) => (
            <button
              key={l.key}
              type="button"
              onClick={() => {
                setManual(true);
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
