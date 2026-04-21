"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { daysInMonth as getDaysInMonth } from "@/lib/dayjs";
import { SegmentControl } from "@/components/common/segment-control";
import { Body } from "@/components/common/typography";
import { Skeleton } from "@/components/ui/skeleton";

export type DailyPoint = Record<string, number | string> & { day: number };

export type ChartMember = { id: string; name: string; goalKm: number };

export type ChartInitialData = {
  mileageData: DailyPoint[];
  percentData: DailyPoint[];
  members: ChartMember[];
  myGoalKm: number;
  myName: string | null;
  totalDays: number;
};

/** FNV-1a — mem_id(UUID 등) 문자열에서 인덱스 클러스터링을 줄임 */
function fnv1a32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 멤버별 고정 색 (같은 mem_id → 항상 동일).
 * 고정 HEX 팔레트 대신 색상환을 황금각(≈137.5°) 스텝으로 훑어 비슷한 파랑·보라만 연속되지 않게 함.
 * 30명 규모에서도 채도·명도를 약간만 바꿔 구분도 유지.
 */
function colorByMemberId(memId: string): string {
  const h = fnv1a32(memId);
  const goldenDeg = 137.508;
  const hue = ((h * goldenDeg) % 360 + 360) % 360;
  const sat = 58 + (h % 14);
  const light = 42 + ((h >>> 11) % 14);
  return `hsl(${hue.toFixed(1)} ${sat}% ${light}%)`;
}

type ChartTooltipProps = TooltipContentProps<TooltipValueType, string | number> & {
  myName: string | null;
  mode: "mileage" | "percent";
};

/** recharts NameType = string | number — Tooltip 인라인 컴포넌트 방지 */
function ChartTooltip({ active, payload, label, myName, mode }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const sorted = [...payload].sort((a, b) => {
    const va = typeof a.value === "number" ? a.value : 0;
    const vb = typeof b.value === "number" ? b.value : 0;
    return vb - va;
  });

  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}일</p>
      {sorted.map((entry) => (
        <p
          key={String(entry.dataKey)}
          className={
            entry.name === myName ? "font-bold" : "text-muted-foreground"
          }
          style={{ color: entry.color }}
        >
          {entry.name}:{" "}
          {mode === "percent"
            ? `${Number(entry.value).toFixed(1)}%`
            : `${Number(entry.value).toFixed(1)} km`}
        </p>
      ))}
    </div>
  );
}

type CrewProgressChartProps = {
  evtId: string;
  memId?: string;
  month: string;
  initialData?: ChartInitialData | null;
};

type MemberPercentBar = {
  memId: string;
  name: string;
  percent: number;
  currentKm: number;
  goalKm: number;
};

type PercentBarTooltipProps = {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  myName: string | null;
};

/** 달성률 막대 — dataKey 이름(percent)이 노출되지 않도록 전용 툴팁 */
function PercentBarTooltip({
  active,
  payload,
  myName,
}: PercentBarTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as MemberPercentBar | undefined;
  if (!row) return null;

  const isMe = row.name === myName;
  const goalText =
    row.goalKm > 0 ? `${row.goalKm.toFixed(1)}km` : "-";

  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className={`mb-0.5 font-semibold ${isMe ? "" : "text-muted-foreground"}`}>
        {row.name}
      </p>
      <p className={isMe ? "" : "text-muted-foreground"}>
        {row.percent.toFixed(1)}% ({row.currentKm.toFixed(1)}km/{goalText})
      </p>
    </div>
  );
}

export function CrewProgressChart({
  evtId,
  memId,
  month,
  initialData,
}: CrewProgressChartProps) {
  const [mode, setMode] = useState<"mileage" | "percent">("mileage");
  const [mileageData, setMileageData] = useState<DailyPoint[]>(
    initialData?.mileageData ?? [],
  );
  const [percentData, setPercentData] = useState<DailyPoint[]>(
    initialData?.percentData ?? [],
  );
  const [members, setMembers] = useState<ChartMember[]>(
    initialData?.members ?? [],
  );
  const [myGoalKm, setMyGoalKm] = useState<number>(
    initialData?.myGoalKm ?? 0,
  );
  const [myName, setMyName] = useState<string | null>(
    initialData?.myName ?? null,
  );
  const [totalDays, setTotalDays] = useState(initialData?.totalDays ?? 30);
  const [loading, setLoading] = useState(!initialData);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [y, m] = month.split("-").map(Number);
    const totalDaysInMonth = getDaysInMonth(y, m);
    setTotalDays(totalDaysInMonth);
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(totalDaysInMonth).padStart(2, "0")}`;

    const { data: participants } = await supabase
      .from("evt_team_prt_rel")
      .select("mem_id, init_goal, mem_mst!inner(mem_nm)")
      .eq("evt_id", evtId)
      .eq("aprv_yn", true)
      .lte("stt_mth", month);

    if (!participants || participants.length === 0) {
      setLoading(false);
      return;
    }

    const memIds = participants.map((p) => p.mem_id);

    const [{ data: logs }, { data: goals }] = await Promise.all([
      supabase
        .from("evt_mlg_act_hist")
        .select("mem_id, act_dt, final_mlg")
        .eq("evt_id", evtId)
        .in("mem_id", memIds)
        .gte("act_dt", month)
        .lte("act_dt", monthEnd),
      supabase
        .from("evt_mlg_goal_cfg")
        .select("mem_id, goal_val")
        .eq("evt_id", evtId)
        .in("mem_id", memIds)
        .eq("goal_mth", month),
    ]);

    const goalByMemId = new Map<string, number>();
    for (const g of goals ?? []) {
      goalByMemId.set(g.mem_id, Number(g.goal_val));
    }

    if (memId) {
      const myP = participants.find((p) => p.mem_id === memId);
      if (myP) {
        const goalKm = goalByMemId.get(memId) ?? Number(myP.init_goal ?? 0);
        setMyGoalKm(goalKm);
        setMyName(
          (myP.mem_mst as unknown as { mem_nm: string }).mem_nm,
        );
      }
    }

    const memIdsWithLogs = new Set((logs ?? []).map((l) => l.mem_id));
    const activeParticipants = participants.filter(
      (p) => memIdsWithLogs.has(p.mem_id) || goalByMemId.has(p.mem_id),
    );

    const logsByMem = new Map<string, { day: number; val: number }[]>();
    for (const log of logs ?? []) {
      const day = Number(log.act_dt.split("-")[2]);
      const existing = logsByMem.get(log.mem_id) ?? [];
      existing.push({ day, val: Number(log.final_mlg) });
      logsByMem.set(log.mem_id, existing);
    }

    const dailyCumByMem = new Map<string, Map<number, number>>();
    for (const p of activeParticipants) {
      const entries = logsByMem.get(p.mem_id) ?? [];
      const sorted = [...entries].sort((a, b) => a.day - b.day);
      const dayMap = new Map<number, number>();
      let cum = 0;
      for (const e of sorted) {
        cum += e.val;
        dayMap.set(e.day, Number(cum.toFixed(2)));
      }
      dailyCumByMem.set(p.mem_id, dayMap);
    }

    const mPoints: DailyPoint[] = [];
    const pPoints: DailyPoint[] = [];

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const mPoint: DailyPoint = { day: d };
      const pPoint: DailyPoint = { day: d };

      for (const p of activeParticipants) {
        const name = (p.mem_mst as unknown as { mem_nm: string }).mem_nm;
        const dayMap = dailyCumByMem.get(p.mem_id);
        let val = 0;
        if (dayMap) {
          for (let dd = d; dd >= 1; dd--) {
            if (dayMap.has(dd)) {
              val = dayMap.get(dd)!;
              break;
            }
          }
        }
        mPoint[name] = Number(val.toFixed(1));
        const goal =
          goalByMemId.get(p.mem_id) ?? Number(p.init_goal ?? 0);
        pPoint[name] =
          goal > 0
            ? Number(Math.min((val / goal) * 100, 100).toFixed(1))
            : 0;
      }

      mPoints.push(mPoint);
      pPoints.push(pPoint);
    }

    const memberList: ChartMember[] = activeParticipants.map((p) => ({
      id: p.mem_id,
      name: (p.mem_mst as unknown as { mem_nm: string }).mem_nm,
      goalKm: goalByMemId.get(p.mem_id) ?? Number(p.init_goal ?? 0),
    }));

    setMembers(memberList);
    setMileageData(mPoints);
    setPercentData(pPoints);
    setLoading(false);
  }, [evtId, memId, month]);

  // initialData 없을 때만 초기 fetch
  useEffect(() => {
    if (!initialData) {
      load();
    }
  }, [initialData, load]);

  // mileage:refresh 이벤트 → 클라이언트 재조회
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("mileage:refresh", handler);
    return () => window.removeEventListener("mileage:refresh", handler);
  }, [load]);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  const chartData = mode === "mileage" ? mileageData : percentData;
  const mileageMax = members.reduce((max, member) => {
    const memberMax = mileageData.reduce((m, row) => {
      const value = row[member.name];
      return typeof value === "number" ? Math.max(m, value) : m;
    }, 0);
    return Math.max(max, memberMax);
  }, 0);
  const mileageTicks =
    mileageMax > 0
      ? Array.from({ length: 5 }, (_, i) => Number(((mileageMax * i) / 4).toFixed(1)))
      : [0, 20, 40, 60, 80];
  const mileageYAxisMax = mileageTicks[mileageTicks.length - 1];
  const memberPercentData: MemberPercentBar[] = members
    .map((member) => {
      const latestMileage = mileageData[mileageData.length - 1];
      const latest = percentData[percentData.length - 1];
      const currentKmRaw = latestMileage?.[member.name];
      const value = latest?.[member.name];
      const currentKm = typeof currentKmRaw === "number" ? currentKmRaw : 0;
      const percent = typeof value === "number" ? value : 0;
      return {
        memId: member.id,
        name: member.name,
        percent,
        currentKm: Number(currentKm.toFixed(1)),
        goalKm: member.goalKm ?? 0,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  if (chartData.length === 0 || members.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-muted">
        <Body className="text-muted-foreground">아직 기록이 없습니다</Body>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 outline-none **:outline-none">
      <SegmentControl
        segments={[
          { value: "mileage", label: "마일리지" },
          { value: "percent", label: "달성률" },
        ]}
        value={mode}
        onValueChange={setMode}
      />

      <ResponsiveContainer width="100%" height={240} className="outline-none">
        {mode === "mileage" ? (
          <LineChart data={chartData}>
            {mileageTicks.map((tick) => (
              <ReferenceLine
                key={tick}
                y={tick}
                stroke="hsl(var(--border))"
                strokeOpacity={0.65}
              />
            ))}
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              domain={[1, totalDays]}
              tickFormatter={(d: number) => `${d}일`}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => `${v}`}
              width={36}
              ticks={mileageTicks}
              domain={[0, mileageYAxisMax]}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip {...props} myName={myName} mode={mode} />
              )}
            />
            {myGoalKm > 0 && (
              <ReferenceLine
                y={myGoalKm}
                stroke="var(--muted-foreground)"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: `목표 ${myGoalKm}`,
                  position: "right",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
            )}
            {members.map((member) => (
              <Line
                key={member.id}
                type="monotone"
                dataKey={member.name}
                stroke={colorByMemberId(member.id)}
                dot={false}
                strokeWidth={member.name === myName ? 3 : 1.5}
                opacity={member.name === myName ? 1 : 0.65}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={memberPercentData} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
            {[0, 20, 40, 60, 80, 100].map((tick) => (
              <ReferenceLine
                key={tick}
                y={tick}
                stroke="hsl(var(--border))"
                strokeOpacity={0.65}
              />
            ))}
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={44}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => `${v}%`}
              width={36}
              domain={[0, 100]}
            />
            <Tooltip content={<PercentBarTooltip myName={myName} />} />
            <ReferenceLine
              y={100}
              stroke="var(--muted-foreground)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: "100%",
                position: "right",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
            <Bar dataKey="percent" radius={[6, 6, 0, 0]}>
              {memberPercentData.map((item) => (
                <Cell
                  key={item.memId}
                  fill={colorByMemberId(item.memId)}
                  fillOpacity={item.name === myName ? 1 : 0.72}
                />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
