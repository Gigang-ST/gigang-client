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

function monthBounds(monthKey: string): { start: string; end: string } {
  const d = dayjs(monthKey + "-01");
  return {
    start: d.format("YYYY-MM-01"),
    end: d.endOf("month").format("YYYY-MM-DD"),
  };
}

function prevMonthKey(key: string) {
  return dayjs(key + "-01").subtract(1, "month").format("YYYY-MM");
}

function nextMonthKey(key: string) {
  return dayjs(key + "-01").add(1, "month").format("YYYY-MM");
}

async function fetchMonth(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
  memberId: string | undefined,
  monthKey: string,
): Promise<CalendarRace[]> {
  const { start, end } = monthBounds(monthKey);

  const [{ data: schRows }, { data: gigangRows }, myRows] = await Promise.all([
    supabase.rpc("get_public_team_sch_posts", {
      p_team_id: teamId,
      p_start: start,
      p_end: end,
    }),
    supabase.rpc("get_public_team_competitions", {
      p_team_id: teamId,
      p_start: start,
      p_end: end,
    }),
    memberId
      ? supabase
          .from("comp_reg_rel")
          .select("team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm))")
          .eq("mem_id", memberId)
          .eq("team_comp_plan_rel.team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false)
      : Promise.resolve({ data: null }),
  ]);

  const results: CalendarRace[] = [];
  const seen = new Set<string>();
  const regCountMap = new Map<string, number>(
    (gigangRows ?? []).map((row) => [row.comp_id, row.reg_count ?? 0]),
  );

  // 내 대회
  if (myRows.data) {
    for (const r of myRows.data) {
      const plan = Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel;
      const comp = Array.isArray(plan?.comp_mst) ? plan.comp_mst[0] : plan?.comp_mst;
      if (!comp || comp.stt_dt < start || comp.stt_dt > end) continue;
      const key = `mine:${comp.comp_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const compRow = (gigangRows ?? []).find((r) => r.comp_id === comp.comp_id);
      results.push({
        id: comp.comp_id,
        title: comp.comp_nm,
        start_date: comp.stt_dt,
        type: "mine",
        location: comp.loc_nm ?? null,
        regCount: regCountMap.get(comp.comp_id) ?? 0,
        cmntCount: compRow?.cmnt_count ? Number(compRow.cmnt_count) : undefined,
      });
    }
  }

  // 공유 일정
  for (const row of schRows ?? []) {
    const key = `sch:${row.sch_post_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: row.sch_post_id,
      title: row.sch_nm,
      start_date: dayjs(row.evt_stt_at).tz("Asia/Seoul").format("YYYY-MM-DD"),
      type: "schedule",
      post_type: row.post_type,
      end_date: row.evt_end_at,
      evt_stt_at: row.evt_stt_at,
      evt_end_at: row.evt_end_at,
      url: row.url,
      cont_txt: row.cont_txt,
      crt_by: row.crt_by,
      crt_by_nm: row.crt_by_nm ?? null,
      cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
    });
  }

  // 기강 대회 (참가자 1명 이상)
  const gigangSeen = new Set<string>();
  for (const row of gigangRows ?? []) {
    if ((row.reg_count ?? 0) === 0) continue;
    if (gigangSeen.has(row.comp_id)) continue;
    gigangSeen.add(row.comp_id);
    const key = `gigang:${row.comp_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: row.comp_id,
      title: row.comp_nm,
      start_date: row.stt_dt,
      type: "gigang",
      location: row.loc_nm ?? null,
      regCount: row.reg_count ?? 0,
    });
  }

  results.sort((a, b) => a.start_date.localeCompare(b.start_date));
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

  const [months, setMonths] = useState<MonthData[]>([
    { monthKey: initialMonthKey, races: [...initialRaces].sort((a, b) => a.start_date.localeCompare(b.start_date)) },
  ]);
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
      const key = prevMonthKey(oldestMonth);
      const races = await fetchMonth(supabase, teamId, memberId, key);
      if (races.length === 0) {
        setCanLoadPrev(false);
        return;
      }
      prevScrollHeightRef.current = containerRef.current?.scrollHeight ?? 0;
      setMonths((prev) => [{ monthKey: key, races }, ...prev]);
    } finally {
      setLoadingPrev(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPrev, canLoadPrev, oldestMonth, teamId, memberId]);

  const loadNext = useCallback(async () => {
    if (loadingNext || !canLoadNext) return;
    setLoadingNext(true);
    try {
      const key = nextMonthKey(newestMonth);
      const races = await fetchMonth(supabase, teamId, memberId, key);
      if (races.length === 0) {
        setCanLoadNext(false);
        return;
      }
      setMonths((prev) => [...prev, { monthKey: key, races }]);
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
