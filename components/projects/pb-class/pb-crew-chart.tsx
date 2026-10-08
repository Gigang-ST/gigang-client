"use client";

import { useMemo } from "react";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  crewYTicks,
  formatCnt,
  toPbCrewChartData,
  type PbCrewAttd,
  type PbCrewColumn,
} from "@/lib/pb-class-chart";

import { Micro } from "@/components/common/typography";

import type { TooltipContentProps, TooltipValueType, XAxisTickContentProps } from "recharts";

/**
 * 크루 누적 출석 그래프 — 마일리지런 크루 진행 차트(`crew-progress-chart.tsx`)의 PB 판.
 *
 * ## 왜 「모두의 선 + 나 + 평균」인가 (11명 뷰를 따르지 않은 이유)
 * 마일리지 차트는 km 가 연속값이라 선끼리 갈라지고, 그래서 11명을 골라 색을 달아도 읽힌다.
 * 출석은 회차마다 0·1 이 쌓이는 **정수**라 사람들의 선이 같은 격자점을 지나며 그대로 포개진다 —
 * 색을 11개 달면 위에 그려진 몇 개만 보이고 나머지 색은 사라진다. 그래서 반대로 간다:
 * 전원을 같은 옅은 회색 선으로 깔면 **포개질수록 진해져** 「크루가 주로 지나간 길」이 저절로 드러나고,
 * 그 위에 나(primary 굵은 선)·크루 평균(점선)·내 전액 기준선(초록 점선)만 또렷하게 세운다.
 * 이름은 이 그래프에서 묻지 않는다 — 옆 세그먼트에 있던 출석표(이름 × 회차)도 오너가 걷었다(2026-10-08).
 * 남의 출석을 이름으로 대는 자리는 이제 없다. 이 그래프는 「크루가 어디쯤인가」와 「나는 어디인가」만 말한다.
 *
 * ## 축
 * 가로는 1주차~측정 13칸을 늘 세운다(시즌이 얼마나 남았는지 보이게 — 마일리지 차트가 달 전체를 세우는 것과 같다).
 * 세로 끝도 지금 값이 아니라 총 회차라, 전액 기준선이 시즌 내내 같은 높이에 머문다.
 * 취소된 회차는 눈금에 취소선을 긋고, 누적은 그 칸에서 평평하게 잇는다(떨어지지도 오르지도 않는다).
 */

const STROKE = {
  me: "var(--primary)",
  avg: "var(--foreground)",
  req: "var(--success)",
  crew: "var(--muted-foreground)",
} as const;

const DASH = { avg: "5 3", req: "2 3" } as const;

type CrewTooltipProps = TooltipContentProps<TooltipValueType, string | number> & {
  columns: PbCrewColumn[];
  meByTick: Map<string, number | null>;
  avgByTick: Map<string, number | null>;
};

/** recharts 툴팁 — 남의 이름을 늘어놓지 않고 그 회차의 인원·나·평균만 말한다(40줄짜리 툴팁은 못 읽는다) */
function CrewTooltip({ active, label, columns, meByTick, avgByTick }: CrewTooltipProps) {
  if (!active) return null;
  const col = columns.find((c) => c.tick === String(label));
  if (!col) return null;

  const me = meByTick.get(col.tick) ?? null;
  const avg = avgByTick.get(col.tick) ?? null;

  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-semibold tabular-nums">
        {col.label}
        {col.dt && <span className="ml-1 font-normal text-muted-foreground">{col.dt}</span>}
      </p>
      {col.state === "held" ? (
        <div className="flex flex-col gap-0.5 tabular-nums">
          <p className="text-muted-foreground">
            {col.eligibleCnt}명 중 <span className="font-semibold text-foreground">{col.attdCnt}명</span> 출석
          </p>
          {me !== null && <p className="font-semibold text-primary">나 · 누적 {me}회</p>}
          {avg !== null && <p className="text-muted-foreground">크루 평균 · {formatCnt(avg)}회</p>}
        </div>
      ) : (
        <p className="text-muted-foreground">
          {col.state === "canceled" ? "취소된 회차예요" : col.state === "unlinked" ? "아직 미정이에요" : "다가오는 회차예요"}
        </p>
      )}
    </div>
  );
}

type ColTickProps = XAxisTickContentProps & { columns: PbCrewColumn[] };

/** 가로 눈금 — 열린 회차는 진하게, 예정은 흐리게, 취소는 취소선 */
function ColTick({ x, y, payload, columns }: ColTickProps) {
  const col = columns[payload.index];
  const held = col?.state === "held";
  return (
    <text
      x={x}
      y={y}
      dy={11}
      textAnchor="middle"
      fontSize={10}
      fill={held ? "var(--foreground)" : "var(--muted-foreground)"}
      fillOpacity={held ? 0.75 : 0.6}
      textDecoration={col?.state === "canceled" ? "line-through" : undefined}
    >
      {payload.value}
    </text>
  );
}

/** 범례 견본 — 차트의 선 모양을 그대로 줄여 그린다(색만 맞추면 평균·기준선이 헷갈린다) */
function Swatch({ kind }: { kind: "me" | "avg" | "req" }) {
  return (
    <svg aria-hidden width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="15"
        y2="4"
        stroke={STROKE[kind]}
        strokeWidth={kind === "me" ? 3 : 1.75}
        strokeLinecap="round"
        strokeDasharray={kind === "me" ? undefined : DASH[kind]}
      />
    </svg>
  );
}

/** 범례 겸 판독값 — 선 이름 옆에 지금(마지막 열린 회차) 값을 바로 단다 */
function Readout({ label, value, kind }: { label: string; value: string; kind: "me" | "avg" | "req" }) {
  return (
    <li className="flex items-center gap-1.5">
      <Swatch kind={kind} />
      <Micro>{label}</Micro>
      <Micro className="font-semibold tabular-nums text-foreground">{value}</Micro>
    </li>
  );
}

export const PB_CREW_CHART_H = 200;

export type PbCrewChartProps = { crew: PbCrewAttd };

export function PbCrewChart({ crew }: PbCrewChartProps) {
  const data = useMemo(() => toPbCrewChartData(crew), [crew]);
  const { points, seriesKeys, myRequired, yMax, meNow, avgNow } = data;
  const yTicks = useMemo(() => crewYTicks(yMax), [yMax]);
  const meByTick = useMemo(() => new Map(points.map((p) => [p.tick, p.me])), [points]);
  const avgByTick = useMemo(() => new Map(points.map((p) => [p.tick, p.avg])), [points]);
  // 열린 회차가 하나뿐이면 선이 아니라 점 하나라 — 점을 찍어야 보인다(마일리지 차트 1일차와 같은 처리)
  const single = crew.heldCnt === 1;

  const summary = [
    meNow !== null ? `나 ${meNow}회` : null,
    avgNow !== null ? `크루 평균 ${formatCnt(avgNow)}회` : null,
    myRequired !== null ? `전액 기준 ${myRequired}회` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <figure className="flex flex-col gap-2 outline-none **:outline-none">
      <figcaption className="sr-only">회차별 누적 출석 그래프. {summary}</figcaption>
      <ul aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {meNow !== null && <Readout kind="me" label="나" value={`${meNow}회`} />}
        {avgNow !== null && <Readout kind="avg" label="크루 평균" value={`${formatCnt(avgNow)}회`} />}
        {myRequired !== null && <Readout kind="req" label="전액 기준" value={`${myRequired}회`} />}
      </ul>

      <ResponsiveContainer width="100%" height={PB_CREW_CHART_H} className="outline-none">
        <LineChart data={points} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
          {yTicks.map((t) => (
            <ReferenceLine key={t} y={t} stroke="var(--border)" strokeOpacity={0.65} />
          ))}
          {myRequired !== null && (
            <ReferenceLine
              y={myRequired}
              stroke={STROKE.req}
              strokeWidth={1.5}
              strokeDasharray={DASH.req}
              label={{
                // 범례가 숫자를 이미 말한다 — 선 위엔 무엇의 선인지만
                value: "전액",
                // 선 위쪽 왼편 — 시즌 초반 선들은 바닥에 있어 겹치지 않는다
                position: "insideBottomLeft",
                fill: STROKE.req,
                fontSize: 11,
                fontWeight: 600,
              }}
            />
          )}
          <XAxis
            dataKey="tick"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            padding={{ left: 10, right: 14 }}
            height={22}
            tick={(props: XAxisTickContentProps) => <ColTick {...props} columns={crew.columns} />}
          />
          <YAxis
            domain={[0, yMax]}
            ticks={yTicks}
            allowDecimals={false}
            width={22}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={(props) => (
              <CrewTooltip {...props} columns={crew.columns} meByTick={meByTick} avgByTick={avgByTick} />
            )}
          />

          {/* 크루 — 같은 회색을 옅게. 포개진 만큼 진해져 많이 지나간 길이 드러난다. 40개라 애니메이션은 끈다 */}
          {seriesKeys.map((key) => (
            <Line
              key={key}
              dataKey={key}
              type="linear"
              stroke={STROKE.crew}
              strokeOpacity={0.28}
              strokeWidth={1.25}
              dot={single ? { r: 2, fill: STROKE.crew, fillOpacity: 0.3, strokeWidth: 0 } : false}
              activeDot={false}
              isAnimationActive={false}
            />
          ))}
          <Line
            dataKey="avg"
            type="linear"
            stroke={STROKE.avg}
            strokeOpacity={0.85}
            strokeWidth={1.5}
            strokeDasharray={DASH.avg}
            dot={single ? { r: 2.5, fill: STROKE.avg, strokeWidth: 0 } : false}
            activeDot={false}
          />
          <Line
            dataKey="me"
            type="linear"
            stroke={STROKE.me}
            strokeWidth={3}
            dot={{ r: 3, fill: STROKE.me, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: STROKE.me, stroke: "var(--background)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
