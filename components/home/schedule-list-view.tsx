"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MapPin } from "lucide-react";

import { dayjs, todayKST } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { schPostTypeInlineLabel } from "@/lib/validations/schedule";
import type { SchPostType } from "@/lib/validations/schedule";

import { Caption, Micro, SectionLabel } from "@/components/common/typography";

import type { CalendarRace } from "./mini-calendar";

type MonthData = {
  monthKey: string; // "YYYY-MM"
  races: CalendarRace[];
};

type Props = {
  teamId: string;
  memberId?: string;
  initialMonthKey: string;
  initialRaces: CalendarRace[];
  onClickSchedule: (race: CalendarRace) => void;
  onClickCompetition: (race: CalendarRace) => void;
};


type SchedulePagedRow = {
  item_type: string;
  item_id: string;
  item_nm: string;
  post_type: string | null;
  start_date: string;
  end_date: string | null;
  loc_nm: string | null;
  url: string | null;
  cont_txt: string | null;
  evt_stt_at: string | null;
  evt_end_at: string | null;
  crt_by: string | null;
  crt_by_nm: string | null;
  reg_count: number | null;
  cmnt_count: number;
};

async function fetchAdjacent(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
  memberId: string | undefined,
  direction: "prev" | "next",
  cursorDate: string,
  monthLimit: number,
): Promise<CalendarRace[]> {
  const { data, error } = await supabase.rpc("get_schedule_paged", {
    p_team_id: teamId,
    p_direction: direction,
    p_cursor_date: cursorDate,
    p_mem_id: memberId ?? null,
    p_month_limit: monthLimit,
  });
  if (error || !data) return [];

  const seen = new Set<string>();
  const results: CalendarRace[] = [];
  for (const row of data as SchedulePagedRow[]) {
    const key = `${row.item_type}:${row.item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (row.item_type === "sch_post") {
      results.push({
        id: row.item_id,
        title: row.item_nm,
        start_date: row.start_date,
        type: "schedule",
        post_type: row.post_type ?? null,
        end_date: row.end_date ?? null,
        evt_stt_at: row.evt_stt_at ?? null,
        evt_end_at: row.evt_end_at ?? null,
        url: row.url ?? null,
        cont_txt: row.cont_txt ?? null,
        crt_by: row.crt_by ?? undefined,
        crt_by_nm: row.crt_by_nm ?? null,
        cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
      });
    } else {
      results.push({
        id: row.item_id,
        title: row.item_nm,
        start_date: row.start_date,
        type: row.item_type === "mine" ? "mine" : "gigang",
        location: row.loc_nm ?? null,
        regCount: row.reg_count ? Number(row.reg_count) : 0,
        cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
      });
    }
  }
  return results;
}

function formatTimeRange(sttAt: string | null | undefined, endAt: string | null | undefined): string | null {
  if (!sttAt) return null;
  const stt = dayjs(sttAt).tz("Asia/Seoul");
  if (!endAt) return stt.format("HH:mm");
  const end = dayjs(endAt).tz("Asia/Seoul");
  const sameDay = stt.format("YYYY-MM-DD") === end.format("YYYY-MM-DD");
  if (sameDay) return `${stt.format("HH:mm")} ~ ${end.format("HH:mm")}`;
  const sameMonth = stt.month() === end.month() && stt.year() === end.year();
  const fmt = sameMonth ? "D일 HH:mm" : "M/D HH:mm";
  return `${stt.format(fmt)} ~ ${end.format(fmt)}`;
}

// schedule 타입 아이템
function ScheduleItem({ race, onClick }: { race: CalendarRace; onClick: () => void }) {
  const timeRange = formatTimeRange(race.evt_stt_at, race.evt_end_at);

  return (
    <button
      onClick={onClick}
      className="flex w-full items-stretch gap-2.5 rounded-lg px-2 py-0.5 text-left transition-all active:scale-[0.98] active:bg-secondary hover:bg-secondary/60"
    >
      <span className="w-0.5 shrink-0 rounded-full bg-info" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Caption className="truncate font-medium text-foreground">
          {race.title}
          {race.post_type && schPostTypeInlineLabel[race.post_type as SchPostType] && (
            <span className="font-normal text-muted-foreground"> · {schPostTypeInlineLabel[race.post_type as SchPostType]}</span>
          )}
        </Caption>
        {(timeRange || (race.cmntCount ?? 0) > 0) && (
          <Micro className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
            {timeRange && <span>{timeRange}</span>}
            {(race.cmntCount ?? 0) > 0 && <span>💬 {race.cmntCount}</span>}
          </Micro>
        )}
        {race.cont_txt && (
          <Micro className="truncate text-muted-foreground">{race.cont_txt}</Micro>
        )}
      </span>
      {race.url && (
        <span className="flex shrink-0 items-center self-center rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground">
          링크
        </span>
      )}
    </button>
  );
}

// 대회 타입 아이템 (gigang / mine)
function CompetitionItem({
  race,
  onClick,
}: {
  race: CalendarRace;
  onClick: () => void;
}) {
  const isMine = race.type === "mine";

  return (
    <button
      onClick={onClick}
      className="flex w-full items-stretch gap-2.5 rounded-lg px-2 py-0.5 text-left transition-all active:scale-[0.98] active:bg-secondary hover:bg-secondary/60"
    >
      <span
        className={cn(
          "w-0.5 shrink-0 rounded-full",
          isMine ? "bg-success" : "bg-warning",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Caption className="truncate font-medium text-foreground">{race.title}</Caption>
        {(race.location || (race.cmntCount ?? 0) > 0) && (
          <Micro className="flex items-center gap-1.5 text-muted-foreground">
            {race.location && (
              <>
                <MapPin className="size-2.5 shrink-0" />
                <span className="truncate">{race.location}</span>
              </>
            )}
            {(race.cmntCount ?? 0) > 0 && <span>💬 {race.cmntCount}</span>}
          </Micro>
        )}
      </span>
      <span className="flex w-20 shrink-0 items-center justify-end gap-1.5 self-center">
        {(race.regCount ?? 0) > 0 && (
          <Micro className="text-muted-foreground tabular-nums">{race.regCount}명</Micro>
        )}
        <span
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium",
            isMine
              ? "border-success/40 bg-success/10 text-success"
              : "border-border text-foreground",
          )}
        >
          참가
        </span>
      </span>
    </button>
  );
}

export function ScheduleListView({
  teamId,
  memberId,
  initialMonthKey,
  initialRaces,
  onClickSchedule,
  onClickCompetition,
}: Props) {
  const supabase = createClient();
  const today = todayKST();

  const [months, setMonths] = useState<MonthData[]>(() => {
    // start_date의 실제 월(YYYY-MM)로 분류 — 월 경계에 걸친 일정을 올바른 월에 배치
    const buckets = new Map<string, CalendarRace[]>();
    for (const race of initialRaces) {
      const key = race.start_date.slice(0, 7); // "YYYY-MM"
      const list = buckets.get(key) ?? [];
      list.push(race);
      buckets.set(key, list);
    }
    if (buckets.size === 0) {
      return [{ monthKey: initialMonthKey, races: [] }];
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, races]) => ({
        monthKey: key,
        races: [...races].sort((a, b) => a.start_date.localeCompare(b.start_date)),
      }));
  });
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [canLoadPrev, setCanLoadPrev] = useState(true);
  const [canLoadNext, setCanLoadNext] = useState(true);
  const oldestMonth = months[0].monthKey;
  const newestMonth = months[months.length - 1].monthKey;

  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);

  const loadPrev = useCallback(async () => {
    if (loadingPrev || !canLoadPrev) return;
    setLoadingPrev(true);
    try {
      const cursorDate = dayjs(oldestMonth + "-01").format("YYYY-MM-DD");
      const races = await fetchAdjacent(supabase, teamId, memberId, "prev", cursorDate, 2);
      if (races.length === 0) {
        setCanLoadPrev(false);
        return;
      }
      const buckets = new Map<string, CalendarRace[]>();
      for (const race of races) {
        const key = race.start_date.slice(0, 7);
        const list = buckets.get(key) ?? [];
        list.push(race);
        buckets.set(key, list);
      }
      const newMonths = Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, r]) => ({ monthKey: key, races: r }));
      prevScrollHeightRef.current = containerRef.current?.scrollHeight ?? 0;
      setMonths((prev) => [...newMonths, ...prev]);
    } finally {
      setLoadingPrev(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPrev, canLoadPrev, oldestMonth, teamId, memberId]);

  const loadNext = useCallback(async () => {
    if (loadingNext || !canLoadNext) return;
    setLoadingNext(true);
    try {
      const cursorDate = dayjs(newestMonth + "-01").endOf("month").format("YYYY-MM-DD");
      const races = await fetchAdjacent(supabase, teamId, memberId, "next", cursorDate, 1);
      if (races.length === 0) {
        setCanLoadNext(false);
        return;
      }
      const buckets = new Map<string, CalendarRace[]>();
      for (const race of races) {
        const key = race.start_date.slice(0, 7);
        const list = buckets.get(key) ?? [];
        list.push(race);
        buckets.set(key, list);
      }
      const [firstKey, firstRaces] = Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))[0];
      setMonths((prev) => [...prev, { monthKey: firstKey, races: firstRaces }]);
    } finally {
      setLoadingNext(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingNext, canLoadNext, newestMonth, teamId, memberId]);

  // 이전 달 prepend 후 스크롤 위치 보정
  useEffect(() => {
    if (prevScrollHeightRef.current === 0) return;
    const container = containerRef.current;
    if (!container) return;
    const diff = container.scrollHeight - prevScrollHeightRef.current;
    container.scrollTop += diff;
    prevScrollHeightRef.current = 0;
  }, [months]);

  // IntersectionObserver — root를 스크롤 컨테이너로 지정해 마운트 시 자동 발화 방지
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === topSentinelRef.current) loadPrev();
          if (entry.target === bottomSentinelRef.current) loadNext();
        }
      },
      {
        root: container,
        rootMargin: "0px",
        threshold: 0,
      },
    );
    if (topSentinelRef.current) obs.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) obs.observe(bottomSentinelRef.current);
    return () => obs.disconnect();
  }, [loadPrev, loadNext]);

  return (
    <div
      ref={containerRef}
      className="h-[380px] overflow-x-hidden overflow-y-auto"
    >
      {/* 상단 sentinel */}
      <div ref={topSentinelRef} className="flex h-4 items-center justify-center">
        {loadingPrev && <Micro className="text-muted-foreground">불러오는 중...</Micro>}
      </div>

      <div className="flex flex-col">
        {months.map(({ monthKey, races }) => {
          const [y, m] = monthKey.split("-").map(Number);
          const monthLabel = `${y}년 ${m}월`;

          // 날짜별 그룹핑 (중복 id 제거)
          const seenIds = new Set<string>();
          const byDate = new Map<string, CalendarRace[]>();
          for (const race of races) {
            if (seenIds.has(race.id)) continue;
            seenIds.add(race.id);
            const list = byDate.get(race.start_date) ?? [];
            list.push(race);
            byDate.set(race.start_date, list);
          }

          return (
            <div key={monthKey}>
              {/* sticky 월 헤더 — 스크롤 컨테이너 기준 상단 고정 */}
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-background py-1.5 pointer-events-none">
                <div className="h-px flex-1 bg-border" />
                <SectionLabel>{monthLabel}</SectionLabel>
                <div className="h-px flex-1 bg-border" />
              </div>

              {byDate.size === 0 ? (
                <div className="px-1 py-3">
                  <Caption className="text-muted-foreground">일정 없음</Caption>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border/40 py-1">
                  {Array.from(byDate.entries()).map(([dateStr, dateRaces]) => {
                    const dayjsDate = dayjs(dateStr);
                    const isToday = dateStr === today;
                    return (
                      <div key={dateStr} className="flex gap-3 py-2.5">
                        {/* 날짜 컬럼 */}
                        <div className="flex w-9 shrink-0 flex-col items-center">
                          <span
                            className={cn(
                              "text-[17px] font-bold leading-none tabular-nums",
                              isToday ? "text-primary" : "text-foreground",
                            )}
                          >
                            {dayjsDate.format("D")}
                          </span>
                          <Caption
                            className={cn(isToday ? "text-primary" : "text-muted-foreground")}
                          >
                            {dayjsDate.format("ddd")}
                          </Caption>
                        </div>

                        {/* 일정 목록 */}
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                          {dateRaces.map((race) =>
                            race.type === "schedule" ? (
                              <ScheduleItem
                                key={race.id}
                                race={race}
                                onClick={() => onClickSchedule(race)}
                              />
                            ) : (
                              <CompetitionItem
                                key={race.id}
                                race={race}
                                onClick={() => onClickCompetition(race)}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 sentinel */}
      <div ref={bottomSentinelRef} className="flex h-4 items-center justify-center">
        {loadingNext && <Micro className="text-muted-foreground">불러오는 중...</Micro>}
      </div>
    </div>
  );
}
