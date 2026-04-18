"use client";

// my-sport-chart.tsx
// 서버 wrapper + 클라이언트 차트를 한 파일에 구성.
// 서버 부분은 별도 파일(my-sport-chart-server.tsx)에서 async 함수로 export하고
// 이 파일은 클라이언트 차트만 담당한다.
// 실제 데이터 fetch는 MySportChart (서버 컴포넌트) 에서 수행 후 props로 전달.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Body, Caption } from "@/components/common/typography";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

export type SportChartData = {
  sport: MileageSport;
  mileage: number;
};

// ─────────────────────────────────────────
// 종목별 색상 맵 (CSS 변수)
// ─────────────────────────────────────────

const SPORT_COLORS: Record<MileageSport, string> = {
  RUNNING: "hsl(var(--sport-road-run))",
  TRAIL: "hsl(var(--sport-trail-run))",
  CYCLING: "hsl(var(--sport-cycling))",
  SWIMMING: "hsl(var(--sport-triathlon))",
};

// ─────────────────────────────────────────
// Tooltip 컴포넌트 (inline 방지를 위해 외부 정의)
// ─────────────────────────────────────────

type ChartTooltipProps = {
  active?: boolean;
  payload?: { name: string; value: number; payload: SportChartData & { percent: number } }[];
};

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-xl border bg-background p-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">
        {MILEAGE_SPORT_LABELS[entry.payload.sport]}
      </p>
      <p className="text-muted-foreground">
        {entry.value.toFixed(1)} km ({(entry.payload.percent * 100).toFixed(1)}%)
      </p>
    </div>
  );
}

// ─────────────────────────────────────────
// 클라이언트 차트 컴포넌트
// ─────────────────────────────────────────

type MySportChartClientProps = {
  data: SportChartData[];
};

export function MySportChartClient({ data }: MySportChartClientProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-muted">
        <Caption>이번 달 기록이 없습니다</Caption>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.mileage, 0);

  // Recharts Cell에 넘길 데이터: percent 추가
  const chartData = data.map((d) => ({
    ...d,
    percent: total > 0 ? d.mileage / total : 0,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* 도넛 차트 */}
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="mileage"
            nameKey="sport"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.sport}
                fill={SPORT_COLORS[entry.sport]}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <ul className="flex flex-col gap-2">
        {chartData.map((entry) => (
          <li key={entry.sport} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: SPORT_COLORS[entry.sport] }}
              />
              <Body className="text-[13px]">{MILEAGE_SPORT_LABELS[entry.sport]}</Body>
            </div>
            <Caption>
              {entry.mileage.toFixed(1)} km ({(entry.percent * 100).toFixed(1)}%)
            </Caption>
          </li>
        ))}
      </ul>
    </div>
  );
}
