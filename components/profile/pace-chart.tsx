"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ---------- 종목별 거리 (km) ---------- */

const DISTANCE_KM: Record<string, number> = {
  FULL: 42.195,
  HALF: 21.0975,
  "10K": 10,
};

/** 범례/라인 순서: 10K → HALF → FULL */
const EVENT_ORDER = ["10K", "HALF", "FULL"] as const;

const EVENT_CONFIG: Record<string, { label: string; color: string }> = {
  FULL: { label: "FULL", color: "#2563eb" },
  HALF: { label: "HALF", color: "#16a34a" },
  "10K": { label: "10K", color: "#ea580c" },
};

type RaceRecord = {
  event_type: string;
  record_time_sec: number;
  race_name: string;
  race_date: string;
};

/* ---------- 유틸 ---------- */

function paceToString(paceMin: number): string {
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

function secondsToTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function oneYearAgoDateString(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/* ---------- 커스텀 Tooltip ---------- */

type PointMeta = { raceName: string; recordSec: number; pace: number };
type ChartRow = Record<string, unknown> & { date: string };

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md">
      <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
      {payload.map((entry) => {
        const et = entry.dataKey as string;
        const meta = entry.payload[`_meta_${et}`] as PointMeta | undefined;
        if (!meta) return null;
        const config = EVENT_CONFIG[et];
        return (
          <div key={et} className="flex flex-col gap-0.5 py-1">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: config?.color }}
              />
              <span className="text-xs font-semibold">
                {config?.label ?? et}
              </span>
            </div>
            <p className="pl-3.5 text-[11px] text-muted-foreground">
              {meta.raceName}
            </p>
            <p className="pl-3.5 text-xs font-mono font-medium">
              {secondsToTime(meta.recordSec)} ({paceToString(meta.pace)}/km)
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 메인 컴포넌트 ---------- */

export function PaceChart({ records }: { records: RaceRecord[] }) {
  const [period, setPeriod] = useState<"1y" | "all">("1y");
  /** 범례 토글: 숨긴 종목 */
  const [hiddenEventTypes, setHiddenEventTypes] = useState<Set<string>>(
    new Set(),
  );

  const { eventTypes, chartData } = useMemo(() => {
    if (records.length === 0)
      return { eventTypes: [] as string[], chartData: [] as ChartRow[] };

    const set = new Set(records.map((r) => r.event_type));
    const types = EVENT_ORDER.filter((et) => set.has(et) && DISTANCE_KM[et]);
    if (types.length === 0)
      return { eventTypes: [] as string[], chartData: [] as ChartRow[] };

    let sorted = [...records]
      .filter((r) => DISTANCE_KM[r.event_type])
      .sort((a, b) => a.race_date.localeCompare(b.race_date));

    if (period === "1y") {
      const cutoff = oneYearAgoDateString();
      sorted = sorted.filter((r) => r.race_date >= cutoff);
    }

    const dateMap = new Map<string, ChartRow>();
    for (const r of sorted) {
      const dist = DISTANCE_KM[r.event_type];
      const pace = r.record_time_sec / 60 / dist;
      const meta: PointMeta = {
        raceName: r.race_name,
        recordSec: r.record_time_sec,
        pace,
      };

      const existing = dateMap.get(r.race_date);
      const dateStr = r.race_date.slice(2).replace(/-/g, ".");
      if (!existing) {
        dateMap.set(r.race_date, {
          date: dateStr,
          [r.event_type]: pace,
          [`_meta_${r.event_type}`]: meta,
        });
      } else {
        const prev = existing[r.event_type] as number | undefined;
        if (prev === undefined || pace < prev) {
          existing[r.event_type] = pace;
          existing[`_meta_${r.event_type}`] = meta;
        }
      }
    }

    const data = Array.from(dateMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );

    return { eventTypes: types, chartData: data };
  }, [records, period]);

  if (eventTypes.length === 0) return null;

  const visibleEventTypes = eventTypes.filter((et) => !hiddenEventTypes.has(et));

  const hasChartData = chartData.length >= 1;

  const chartDataToRender =
    hiddenEventTypes.size === 0
      ? chartData
      : chartData.filter((row) =>
          visibleEventTypes.some((et) => row[et] != null),
        );

  /** 표시 중인 데이터의 페이스 최솟값·최댓값 → Y축에 반드시 포함, 그 사이 균등 눈금 */
  const { yAxisMin, yAxisMax, yAxisTicks } = (() => {
    let min = Infinity;
    let max = -Infinity;
    for (const row of chartDataToRender) {
      for (const et of visibleEventTypes) {
        const v = row[et];
        if (typeof v === "number") {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (min === Infinity) min = 0;
    if (max === -Infinity) max = min;
    if (min === max) max = min + 1;

    const range = max - min;
    const padding = Math.max(0.1, range * 0.05);
    const domainMin = min - padding;
    const domainMax = max + padding;

    const count = 5;
    const ticks: number[] = [min];
    for (let i = 1; i < count - 1; i++) {
      ticks.push(min + ((max - min) * i) / (count - 1));
    }
    ticks.push(max);

    return {
      yAxisMin: domainMin,
      yAxisMax: domainMax,
      yAxisTicks: ticks,
    };
  })();

  const toggleLegend = (et: string) => {
    setHiddenEventTypes((prev) => {
      const next = new Set(prev);
      const isVisible = !next.has(et);
      if (!isVisible) {
        // 이미 숨김 → 다시 보이게
        next.delete(et);
        return next;
      }
      // 마지막 1개는 못 끄게
      if (visibleEventTypes.length <= 1) return prev;
      next.add(et);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          페이스 추이
        </span>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setPeriod("1y")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              period === "1y"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            최근 1년
          </button>
          <button
            type="button"
            onClick={() => setPeriod("all")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              period === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            전체
          </button>
        </div>
      </div>

      <div className="rounded-2xl border-[1.5px] border-border p-4 outline-none **:outline-none">
        {!hasChartData ? (
          <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
            {chartData.length === 0 && period === "1y"
              ? "해당 기간에 기록이 없습니다."
              : "기록이 없습니다."}
          </div>
        ) : (
          <>
            <div className="mb-3 flex w-full justify-center gap-3 text-xs">
              {eventTypes.map((et) => {
                const config = EVENT_CONFIG[et];
                const isVisible = !hiddenEventTypes.has(et);
                return (
                  <button
                    key={et}
                    type="button"
                    onClick={() => toggleLegend(et)}
                    className="flex items-center gap-1.5 transition-opacity focus:outline-none"
                    style={{ opacity: isVisible ? 1 : 0.4 }}
                  >
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: config?.color }}
                    />
                    <span className={isVisible ? "font-semibold" : "font-normal"}>
                      {config?.label ?? et}
                    </span>
                  </button>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                key={`${period}-${visibleEventTypes.join(",")}`}
                data={chartDataToRender}
                margin={{ top: 4, right: 8, bottom: 20, left: -16 }}
              >
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  angle={-90}
                  textAnchor="end"
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                />
                {yAxisTicks.map((y) => (
                  <ReferenceLine
                    key={y}
                    y={y}
                    stroke="#e5e7eb"
                    strokeOpacity={0.6}
                  />
                ))}
                <YAxis
                  reversed
                  tick={{ fontSize: 11 }}
                  ticks={yAxisTicks}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => paceToString(v)}
                  domain={[yAxisMin, yAxisMax]}
                />
                <Tooltip content={<CustomTooltip />} />
                {visibleEventTypes.map((et) => (
                  <Line
                    key={et}
                    type="monotone"
                    dataKey={et}
                    stroke={EVENT_CONFIG[et]?.color ?? "#888"}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
