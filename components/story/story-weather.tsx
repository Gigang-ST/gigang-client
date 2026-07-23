import { Cloud, CloudRain, CloudSun, Sun } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { getTeamWeather, getTrendBars } from "@/lib/team-weather";
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
 */
export function StoryWeather({ overview }: { overview: TeamOverview }) {
  // 데이터가 아예 없으면(RPC 미배포·신규 팀) 빈 상자를 그리느니 통째로 접는다.
  if (overview.weeks.length === 0) return null;

  const weather = getTeamWeather(overview.weeks);
  const bars = getTrendBars(overview.weeks);
  const current = overview.weeks[overview.weeks.length - 1];
  const Icon = WEATHER_ICON[weather.level];

  const stats = [
    { label: "회원", value: overview.mem_cnt },
    { label: "모임", value: current.gthr_cnt },
    { label: "참석", value: current.attd_cnt },
    { label: "기록", value: current.rec_cnt },
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
            카드의 개인 컨디션과 같은 척도예요.
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

        {/* 우: 수치 격자 — 신문 일기예보의 관측값 표 */}
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

      {/* 최근 8주 추세 — 이번 주만 진하게 */}
      <div className="flex items-end gap-1 pt-4" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={overview.weeks[i].w_start}
            style={{ height: `${(h / 100) * 28}px` }}
            className={cn(
              "flex-1 rounded-[1px]",
              i === bars.length - 1 ? "bg-foreground" : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="pt-1.5 text-[10px] text-muted-foreground">
        최근 8주 활동량 · 이번 주는 {dayjs(current.w_start).format("M월 D일")}부터
      </p>
    </section>
  );
}
