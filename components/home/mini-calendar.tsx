"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayKST, currentMonthKST } from "@/lib/dayjs";
import { Caption, Micro, SectionLabel } from "@/components/common/typography";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";

export type CalendarRace = {
  id: string;
  title: string;
  start_date: string;
  /** "gigang" = 기강 팀 참가자 1명 이상, "mine" = 내가 참가 */
  type: "gigang" | "mine";
};

type MiniCalendarProps = {
  /** 서버에서 전달하는 이번 달 기강 대회 목록 */
  gigangRaces: CalendarRace[];
  /** 서버에서 전달하는 내 참가 대회 목록 */
  myRaces: CalendarRace[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function MiniCalendar({ gigangRaces, myRaces }: MiniCalendarProps) {
  // 초기 달 = 이번 달 (YYYY-MM-01 문자열)
  const initialMonth = currentMonthKST();
  const [viewMonth] = useState(initialMonth); // 이번 달만 표시 (확장 예정)
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = todayKST();

  // viewMonth("YYYY-MM-01")에서 year, month 파싱
  const [yearStr, monthStr] = viewMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-indexed

  // 해당 월의 총 일수
  const totalDays = new Date(year, month, 0).getDate();
  // 1일의 요일 (0=일, 6=토)
  const firstDayOfWeek = new Date(`${year}-${String(month).padStart(2, "0")}-01`).getDay();

  // 날짜별 이벤트 맵 구성
  const eventMap = useMemo(() => {
    const map = new Map<string, { gigang: boolean; mine: boolean }>();

    for (const race of gigangRaces) {
      const key = race.start_date;
      const existing = map.get(key) ?? { gigang: false, mine: false };
      map.set(key, { ...existing, gigang: true });
    }
    for (const race of myRaces) {
      const key = race.start_date;
      const existing = map.get(key) ?? { gigang: false, mine: false };
      map.set(key, { ...existing, mine: true });
    }

    return map;
  }, [gigangRaces, myRaces]);

  // 선택된 날짜의 이벤트
  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    const result: CalendarRace[] = [];

    // 중복 제거: gigangRaces와 myRaces 합쳐서 날짜 일치하는 것
    const seen = new Set<string>();
    for (const race of [...gigangRaces, ...myRaces]) {
      if (race.start_date === selectedDate && !seen.has(race.id)) {
        seen.add(race.id);
        result.push(race);
      }
    }
    return result;
  }, [selectedDate, gigangRaces, myRaces]);

  // 달력 셀 배열 (앞 빈칸 + 날짜)
  const cells: (number | null)[] = [
    ...Array.from<null>({ length: firstDayOfWeek }).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  function formatCellDate(day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function handleDayClick(day: number) {
    const dateStr = formatCellDate(day);
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  }

  const monthLabel = `${year}년 ${month}월`;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader label="SCHEDULE" />

      {/* 캘린더 */}
      <div className="flex flex-col gap-2">
        {/* 월 헤더 */}
        <div className="flex items-center justify-between px-1">
          <Caption className="text-foreground font-medium">{monthLabel}</Caption>
          {/* 이동 버튼 자리 — 추후 확장 예정 */}
          <div className="flex gap-1 opacity-0 pointer-events-none" aria-hidden>
            <button className="size-6 flex items-center justify-center rounded" disabled>
              <ChevronLeft className="size-4" />
            </button>
            <button className="size-6 flex items-center justify-center rounded" disabled>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((wd) => (
            <Micro
              key={wd}
              className={cn(
                "py-1",
                wd === "일" && "text-destructive",
                wd === "토" && "text-primary",
              )}
            >
              {wd}
            </Micro>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div className="grid grid-cols-7 text-center">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} />;
            }
            const dateStr = formatCellDate(day);
            const events = eventMap.get(dateStr);
            const isToday = dateStr === today;
            const isSelected = selectedDate === dateStr;
            const colIndex = (firstDayOfWeek + day - 1) % 7;

            return (
              <button
                key={dateStr}
                onClick={() => handleDayClick(day)}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors",
                  isSelected && "bg-secondary",
                  !isSelected && "hover:bg-secondary/60",
                )}
                aria-label={`${month}월 ${day}일`}
                aria-pressed={isSelected}
              >
                {/* 날짜 숫자 */}
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-[13px] font-medium",
                    isToday && "bg-primary text-primary-foreground font-bold",
                    !isToday && colIndex === 0 && "text-destructive",
                    !isToday && colIndex === 6 && "text-primary",
                    !isToday && !isSelected && "text-foreground",
                  )}
                >
                  {day}
                </span>

                {/* 이벤트 도트 */}
                {events && (
                  <div className="flex gap-0.5">
                    {events.gigang && (
                      <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                    )}
                    {events.mine && (
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                    )}
                  </div>
                )}
                {/* 도트 없을 때 간격 유지 */}
                {!events && <span className="size-1.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warning" />
          <Micro>기강 대회</Micro>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          <Micro>내 대회</Micro>
        </div>
      </div>

      {/* 선택된 날짜 이벤트 목록 */}
      {selectedDate && (
        <div className="flex flex-col gap-2 rounded-xl bg-secondary/60 px-3 py-3">
          <Caption className="font-medium text-foreground">
            {parseInt(selectedDate.split("-")[1], 10)}월{" "}
            {parseInt(selectedDate.split("-")[2], 10)}일
          </Caption>
          {selectedEvents.length === 0 ? (
            <Caption>일정 없음</Caption>
          ) : (
            selectedEvents.map((race) => (
              <div key={race.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    race.type === "mine" ? "bg-primary" : "bg-warning",
                  )}
                />
                <Caption className="text-foreground">{race.title}</Caption>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
