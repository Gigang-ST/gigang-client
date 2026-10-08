"use client";

import { useMemo, useSyncExternalStore } from "react";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { teamYAxis, type PbTeamSeries } from "@/lib/pb-class-chart";

import { formatPt } from "./format";
import { teamColorVar } from "./pb-team-color";

import type { TooltipContentProps, TooltipValueType } from "recharts";

/**
 * 팀별 누적 점수 그래프 — 주차마다 팀 점수가 어떻게 쌓였나(「언제 따라잡았나」를 순위표는 못 말한다).
 *
 * 선은 팀 색 그대로, **내 팀만 굵게** 그린다(순위표의 「내 팀」 테두리와 같은 짚기). 끝점에만 점을 찍는다 —
 * 매 주차에 점을 찍으면 5팀 × 13주 = 65개 점이 깔려 선이 안 보인다. 끝 숫자는 그래프 위 범례가 말한다.
 * 처음 보일 때 선이 왼쪽에서 오른쪽으로 그려진다(경주처럼). 모션을 줄인 사람에겐 바로 완성된 그림.
 */

export const PB_TEAM_CHART_H = 200;

/** 시리즈 키 — `t0` … (grp_id 를 키로 쓰면 DOM 에 id 가 남는다) */
const keyOf = (i: number) => `t${i}`;

type Point = { tick: string; wk: number; [key: string]: string | number };

/** 모션 줄이기 — 서버 스냅샷은 「줄이지 않음」(그래프는 ssr:false 라 서버에서 그려지지 않는다) */
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

type TeamTooltipProps = TooltipContentProps<TooltipValueType, string | number> & {
  series: PbTeamSeries;
  tickLabel: (wk: number) => string;
};

/** 툴팁 — 그 주차의 누적을 높은 순으로, 옆에 그 주에 얻은 점수(+N)를 붙인다 */
function TeamTooltip({ active, label, series, tickLabel }: TeamTooltipProps) {
  if (!active) return null;
  const idx = series.weeks.findIndex((w) => String(w) === String(label));
  if (idx < 0) return null;
  const rows = series.teams
    .map((t) => ({ t, cum: t.cum[idx], gain: t.gain[idx] }))
    .sort((a, b) => b.cum - a.cum);

  return (
    <div className="min-w-32 rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{tickLabel(series.weeks[idx])}</p>
      <ul className="flex flex-col gap-0.5 tabular-nums">
        {rows.map(({ t, cum, gain }) => (
          <li key={t.grpId} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: teamColorVar(t.colorNo) }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.grpNm}</span>
            <span className="font-semibold text-foreground">{formatPt(cum)}</span>
            <span className="w-9 text-right text-muted-foreground">{gain > 0 ? `+${formatPt(gain)}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type PbTeamScoreChartProps = {
  series: PbTeamSeries;
  myGrpId: string | null;
  /** 측정 벙의 주차 — 그 칸 눈금은 숫자 대신 「측정」 */
  measureWkNo: number | null;
};

export function PbTeamScoreChart({ series, myGrpId, measureWkNo }: PbTeamScoreChartProps) {
  const reduced = useReducedMotion();
  const points = useMemo<Point[]>(
    () =>
      series.weeks.map((wk, i) => {
        const p: Point = { tick: String(wk), wk };
        series.teams.forEach((t, j) => {
          p[keyOf(j)] = t.cum[i];
        });
        return p;
      }),
    [series],
  );
  const { max: yMax, ticks: yTicks } = teamYAxis(series);
  const last = series.weeks.length - 1;
  // 한 주차뿐이면 선이 아니라 점 하나 — 점을 찍어야 보인다(크루 출석 그래프 1회차와 같은 처리)
  const single = series.weeks.length === 1;
  const tickLabel = (wk: number) => (wk === measureWkNo ? "측정" : `${wk}주차`);
  const axisTick = (wk: number) => (wk === measureWkNo ? "측정" : String(wk));
  // 주차가 많아지면 눈금이 붙는다 — 13칸까지는 다 세우고, 그 위로는 하나 건너 하나
  const interval = series.weeks.length > 13 ? 1 : 0;

  return (
    <ResponsiveContainer width="100%" height={PB_TEAM_CHART_H} className="outline-none **:outline-none">
      <LineChart data={points} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        {yTicks.map((t) => (
          <ReferenceLine key={t} y={t} stroke="var(--border)" strokeOpacity={0.65} />
        ))}
        <XAxis
          dataKey="tick"
          interval={interval}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          padding={{ left: 8, right: 8 }}
          height={22}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: string) => axisTick(Number(v))}
        />
        <YAxis
          domain={[0, yMax]}
          ticks={yTicks}
          width={30}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) => formatPt(v)}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          isAnimationActive={false}
          content={(props) => <TeamTooltip {...props} series={series} tickLabel={tickLabel} />}
        />
        {/* 내 팀을 맨 뒤에 그려 다른 선 위에 올린다 — 겹치는 구간에서 내 선이 묻히지 않게 */}
        {series.teams
          .map((t, j) => ({ t, j }))
          .sort((a, b) => Number(a.t.grpId === myGrpId) - Number(b.t.grpId === myGrpId))
          .map(({ t, j }) => {
            const color = teamColorVar(t.colorNo);
            const mine = t.grpId === myGrpId;
            return (
              <Line
                key={t.grpId}
                dataKey={keyOf(j)}
                name={t.grpNm}
                type="linear"
                stroke={color}
                strokeWidth={mine ? 3.25 : 2}
                strokeOpacity={myGrpId && !mine ? 0.85 : 1}
                dot={(props: { cx?: number; cy?: number; index?: number }) => (
                  <circle
                    key={`${t.grpId}-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={props.index === last || single ? (mine ? 4.5 : 3.5) : 0}
                    fill={color}
                    stroke="var(--background)"
                    strokeWidth={1.5}
                  />
                )}
                activeDot={{ r: 4.5, fill: color, stroke: "var(--background)", strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={1100}
                animationEasing="ease-out"
              />
            );
          })}
      </LineChart>
    </ResponsiveContainer>
  );
}
