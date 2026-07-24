"use client";

import { useState } from "react";
import { Cloud, CloudRain, CloudSun, Sun } from "lucide-react";

import { formatWeekLabel, getTeamWeather, getTrendBars } from "@/lib/team-weather";
import { cn } from "@/lib/utils";

import { HelpTip } from "@/components/common/help-tip";

import type { LucideIcon } from "lucide-react";
import type { TeamOverview } from "@/lib/queries/team-overview";
import type { TeamWeather } from "@/lib/team-weather";

/** 4단계 컨디션 → 날씨 아이콘. 맑을수록 활발 */
const WEATHER_ICON: Record<TeamWeather["level"], LucideIcon> = {
  blazing: Sun,
  steady: CloudSun,
  resting: Cloud,
  dormant: CloudRain,
};

/**
 * 기강 기상대 — 크루 전체 분위기를 한 상자에.
 *
 * 신문에는 일기예보란이 있다. 이 지면이 신문이므로 크루 총량도 같은 자리, 같은 형식으로 싣는다:
 * 왼쪽에 큰 상태(아이콘 + 한 단어), 오른쪽에 촘촘한 수치 격자, 아래에 추세 막대.
 * "회원 42명"만 나열하는 통계 블록과 달리, **먼저 분위기를 말하고 근거를 뒤에 붙인다.**
 *
 * 단어(기강 그 자체 / 기강 잡아 / 기며든다 / 실종)는 프로필 카드의 개인 컨디션과 같다 —
 * 두 지표가 같은 척도라는 걸 설명 없이 전달하기 위해서.
 *
 * **추세 막대는 탭할 수 있다.** 8주 막대는 원래 "흐름"만 보여주고 끝이라, 각 주가 실제로
 * 몇 번의 모임·참석·기록이었는지는 묻혀 있었다. 막대를 누르면 그 주가 선택되고 수치 격자가
 * 그 주 값으로 바뀐다 — 그래프의 높이가 무슨 뜻인지 그 자리에서 답한다. 기본은 이번 주.
 */
export function StoryWeather({ overview }: { overview: TeamOverview }) {
  const weekCount = overview.weeks.length;
  // 기본 선택 = 마지막 주(이번 주). 데이터가 없으면 -1.
  const [selected, setSelected] = useState(weekCount - 1);

  // 데이터가 아예 없으면(RPC 미배포·신규 팀) 빈 상자를 그리느니 통째로 접는다.
  if (weekCount === 0) return null;

  const weather = getTeamWeather(overview.weeks);
  const bars = getTrendBars(overview.weeks);
  // 선택 인덱스가 범위를 벗어나면(데이터 변동) 이번 주로 되돌린다.
  const activeIdx =
    selected >= 0 && selected < weekCount ? selected : weekCount - 1;
  const active = overview.weeks[activeIdx];
  const isThisWeek = activeIdx === weekCount - 1;
  const Icon = WEATHER_ICON[weather.level];

  // 수치 격자 — 회원은 크루 총량(주와 무관), 나머지는 선택한 주 값.
  const stats = [
    { label: "회원", value: overview.mem_cnt },
    { label: "모임", value: active.gthr_cnt },
    { label: "참석", value: active.attd_cnt },
    { label: "기록", value: active.rec_cnt },
  ];

  return (
    <section className="flex flex-col px-6">
      <div className="rule-section flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Weather
        </h2>
        <div className="-my-2">
          <HelpTip title="기강 기상대">
            이번 주 크루 활동량을 지난 4주 평균과 견줘 한 단어로 나타냅니다. 프로필
            카드의 개인 컨디션과 같은 척도예요. 아래 막대를 누르면 그 주의 수치를 볼 수
            있어요.
          </HelpTip>
        </div>
      </div>

      <div className="flex items-start gap-4 pt-3">
        {/* 좌: 오늘의 기강 — 아이콘과 한 단어가 이 상자의 헤드라인이다 */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Icon className="size-6 shrink-0 text-foreground" aria-hidden />
            <span className="truncate font-serif text-[21px] leading-none text-foreground">
              {weather.label}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {weather.message}
          </p>
        </div>

        {/* 우: 수치 격자 — 선택한 주의 관측값 표 */}
        <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline justify-end gap-1.5">
              <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
              <dd className="w-7 text-right font-numeric text-[15px] font-medium text-foreground tabular-nums">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 최근 8주 추세 — 탭하면 그 주가 선택된다. 선택 주만 진하게 */}
      <div className="flex items-end gap-1 pt-4">
        {bars.map((h, i) => {
          const week = overview.weeks[i];
          return (
            <button
              key={week.w_start}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`${formatWeekLabel(week.w_start)} · 모임 ${week.gthr_cnt} 참석 ${week.attd_cnt} 기록 ${week.rec_cnt}`}
              aria-pressed={i === activeIdx}
              className="group flex flex-1 flex-col items-center justify-end focus-visible:outline-none"
            >
              <span
                style={{ height: `${(h / 100) * 28}px` }}
                className={cn(
                  "w-full rounded-[1px] transition-colors",
                  i === activeIdx
                    ? "bg-foreground"
                    : "bg-border group-hover:bg-muted-foreground",
                )}
              />
            </button>
          );
        })}
      </div>
      {/* 하단은 어느 주를 보고 있는지만 — 수치는 위 격자가 선택 주 값으로 이미 보여주므로 중복하지 않는다 */}
      <p className="pt-1.5 text-[10px] text-muted-foreground">
        {isThisWeek
          ? `이번 주`
          : `${formatWeekLabel(active.w_start)} 기록`}
      </p>
    </section>
  );
}
