"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ---------- 종목별 거리 (km) ---------- */

const DISTANCE_KM: Record<string, number> = {
  FULL: 42.195,
  HALF: 21.0975,
  "10K": 10,
};

const EVENT_CONFIG: Record<string, { label: string; color: string }> = {
  FULL: { label: "풀마라톤", color: "#2563eb" },
  HALF: { label: "하프마라톤", color: "#16a34a" },
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

/* ---------- 커스텀 Tooltip ---------- */

type PointMeta = { raceName: string; recordSec: number; pace: number };
// chartData의 각 row에 종목별 메타를 _meta_FULL 등으로 저장
type ChartRow = Record<string, unknown> & { date: string };

function CustomTooltip({ active, payload, label }: {
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
              <span className="text-xs font-semibold">{config?.label ?? et}</span>
            </div>
            <p className="pl-3.5 text-[11px] text-muted-foreground">{meta.raceName}</p>
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
  if (records.length === 0) return null;

  const eventTypes = [...new Set(records.map((r) => r.event_type))].filter(
    (et) => DISTANCE_KM[et],
  );

  if (eventTypes.length === 0) return null;

  const sorted = [...records]
    .filter((r) => DISTANCE_KM[r.event_type])
    .sort((a, b) => a.race_date.localeCompare(b.race_date));

  // 날짜별 그룹핑: 페이스 + 메타(대회명, 기록)
  const dateMap = new Map<string, ChartRow>();
  for (const r of sorted) {
    const dist = DISTANCE_KM[r.event_type];
    const pace = r.record_time_sec / 60 / dist;
    const meta: PointMeta = { raceName: r.race_name, recordSec: r.record_time_sec, pace };

    const existing = dateMap.get(r.race_date);
    if (!existing) {
      dateMap.set(r.race_date, {
        date: r.race_date.slice(2).replace(/-/g, "."),
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

  const chartData = Array.from(dateMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  if (chartData.length < 2) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground">
        페이스 추이
      </span>
      <div className="rounded-2xl border-[1.5px] border-border p-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => paceToString(v)}
              domain={["dataMin - 0.2", "dataMax + 0.2"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => EVENT_CONFIG[value]?.label ?? value}
              wrapperStyle={{ fontSize: 12 }}
            />
            {eventTypes.map((et) => (
              <Line
                key={et}
                type="monotone"
                dataKey={et}
                stroke={EVENT_CONFIG[et]?.color ?? "#888"}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
