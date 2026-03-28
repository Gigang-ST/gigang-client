"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const SPORT_LABEL: Record<string, string> = {
  running: "러닝",
  trail_running: "트레일러닝",
  cycling: "자전거",
  swimming: "수영",
};

const SPORT_COLOR: Record<string, string> = {
  running: "hsl(210, 70%, 55%)",
  trail_running: "hsl(145, 60%, 45%)",
  cycling: "hsl(35, 80%, 55%)",
  swimming: "hsl(195, 70%, 50%)",
};

const EVENT_COLOR = "hsl(280, 60%, 55%)";

type SportData = {
  sport: string;
  mileage: number;
  distanceContrib: number;
  elevationContrib: number;
};

export function MySportChartClient({
  data,
  eventBonus,
}: {
  data: SportData[];
  eventBonus: number;
}) {
  const chartData = [
    ...data.map((d) => ({ name: d.sport, value: d.mileage })),
    ...(eventBonus > 0 ? [{ name: "event", value: eventBonus }] : []),
  ];

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  const labelMap: Record<string, string> = {
    ...SPORT_LABEL,
    event: "이벤트 보너스",
  };

  // 종목별 세부 정보 맵
  const detailMap = new Map<string, string>();
  for (const d of data) {
    const pct = total > 0 ? ((d.mileage / total) * 100).toFixed(0) : "0";
    const parts: string[] = [];
    if (d.distanceContrib > 0) parts.push(`거리 ${d.distanceContrib}`);
    if (d.elevationContrib > 0) parts.push(`고도 ${d.elevationContrib}`);
    detailMap.set(d.sport, parts.length > 0 ? `${parts.join(" + ")} · ${pct}%` : `${pct}%`);
  }
  if (eventBonus > 0) {
    const pct = ((eventBonus / total) * 100).toFixed(0);
    detailMap.set("event", `${pct}%`);
  }

  return (
    <section className="rounded-xl border p-5 space-y-3">
      <h2 className="font-semibold text-lg">종목별 마일리지</h2>

      <div className="flex items-center gap-4">
        <div className="w-32 h-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={55}
                strokeWidth={2}
                stroke="hsl(var(--background))"
              >
                {chartData.map((d) => (
                  <Cell
                    key={d.name}
                    fill={
                      d.name === "event"
                        ? EVENT_COLOR
                        : (SPORT_COLOR[d.name] ?? "hsl(0, 0%, 60%)")
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const entry = payload[0];
                  const name = entry.name as string;
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                      <p className="font-semibold">{labelMap[name] ?? name}</p>
                      <p>{entry.value} km</p>
                      <p className="text-muted-foreground">{detailMap.get(name)}</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-2 text-sm">
          {data.map((d) => {
            const hasElevation = d.elevationContrib > 0;

            return (
              <div key={d.sport} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          SPORT_COLOR[d.sport] ?? "hsl(0, 0%, 60%)",
                      }}
                    />
                    <span>{SPORT_LABEL[d.sport] ?? d.sport}</span>
                  </div>
                  <span className="font-bold">{d.mileage} km</span>
                </div>
                {hasElevation && (
                  <p className="text-xs text-muted-foreground pl-[18px]">
                    거리 {d.distanceContrib} + 고도 {d.elevationContrib}
                  </p>
                )}
              </div>
            );
          })}

          {eventBonus > 0 && (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: EVENT_COLOR }}
                  />
                  <span>이벤트 보너스</span>
                </div>
                <span className="font-bold">+{eventBonus} km</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
