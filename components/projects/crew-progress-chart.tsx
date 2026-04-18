"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useChartMode } from "@/components/projects/chart-mode-context";
import { SegmentControl } from "@/components/common/segment-control";
import { Body } from "@/components/common/typography";
import { Skeleton } from "@/components/ui/skeleton";

type DailyPoint = { day: number; [key: string]: number };

const CHART_COLORS = [
  "hsl(var(--sport-road-run))",
  "hsl(var(--sport-trail-run))",
  "hsl(var(--sport-cycling))",
  "hsl(var(--sport-triathlon))",
  "hsl(var(--sport-ultra))",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
];

// recharts NameType = string | number
type ChartTooltipProps = TooltipContentProps<TooltipValueType, string | number> & {
  myName: string | null;
  mode: "mileage" | "percent";
};

/** Tooltip 인라인 컴포넌트 방지 — 컴포넌트 외부에서 정의 (rerender-no-inline-components) */
function ChartTooltip({ active, payload, label, myName, mode }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  // readonly 배열을 mutable로 복사 후 정렬
  const sorted = [...payload].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
  const top = sorted.slice(0, 5);
  const meEntry =
    myName && !top.find((e) => e.name === myName)
      ? sorted.find((e) => e.name === myName)
      : null;
  if (meEntry) top.push(meEntry);
  const rest = sorted.length - top.length;
  return (
    <div className="rounded-xl border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{label}일</p>
      {top.map((entry) => (
        <div
          key={String(entry.name)}
          className="flex justify-between gap-3"
          style={{ color: entry.color }}
        >
          <span className="max-w-[80px] truncate">{entry.name}</span>
          <span className="font-medium">
            {mode === "percent"
              ? `${entry.value}%`
              : `${Number(entry.value).toFixed(1)}`}
          </span>
        </div>
      ))}
      {rest > 0 && (
        <p className="mt-1 text-muted-foreground">외 {rest}명</p>
      )}
    </div>
  );
}

type CrewProgressChartProps = {
  evtId: string;
  memId?: string;
  month: string; // "2026-05-01"
};

export function CrewProgressChart({ evtId, memId, month }: CrewProgressChartProps) {
  const { mode, setMode } = useChartMode();
  const [mileageData, setMileageData] = useState<DailyPoint[]>([]);
  const [percentData, setPercentData] = useState<DailyPoint[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [myGoalKm, setMyGoalKm] = useState<number>(0);
  const [myName, setMyName] = useState<string | null>(null);
  const [totalDays, setTotalDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    setTotalDays(daysInMonth);
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // 승인된 참여자 + 이름 조회
    const { data: participants } = await supabase
      .from("evt_team_prt_rel")
      .select("mem_id, init_goal, mem_mst!inner(mem_nm)")
      .eq("evt_id", evtId)
      .eq("approve_yn", true)
      .lte("stt_month", month);

    if (!participants || participants.length === 0) {
      setLoading(false);
      return;
    }

    const memIds = participants.map((p) => p.mem_id);

    // 활동 기록 + 목표 병렬 조회 (async-parallel)
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
        .eq("goal_month", month),
    ]);

    const goalByMemId = new Map<string, number>();
    for (const g of goals ?? []) {
      goalByMemId.set(g.mem_id, Number(g.goal_val));
    }

    // 본인 정보
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

    // 기록이 있거나 목표가 있는 참여자만 차트에 표시
    const memIdsWithLogs = new Set((logs ?? []).map((l) => l.mem_id));
    const activeParticipants = participants.filter(
      (p) => memIdsWithLogs.has(p.mem_id) || goalByMemId.has(p.mem_id),
    );

    // 참여자별 일별 누적 마일리지 계산
    const logsByMem = new Map<string, { day: number; val: number }[]>();
    for (const log of logs ?? []) {
      const day = Number(log.act_dt.split("-")[2]);
      const existing = logsByMem.get(log.mem_id) ?? [];
      existing.push({ day, val: Number(log.final_mlg) });
      logsByMem.set(log.mem_id, existing);
    }

    // 참여자별 일별 누적 맵 생성
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

    // 1일~말일 데이터 포인트 생성
    const mPoints: DailyPoint[] = [];
    const pPoints: DailyPoint[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
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
        const goal = goalByMemId.get(p.mem_id) ?? Number(p.init_goal ?? 0);
        pPoint[name] = goal > 0
          ? Number(Math.min((val / goal) * 100, 100).toFixed(1))
          : 0;
      }

      mPoints.push(mPoint);
      pPoints.push(pPoint);
    }

    const memberList = activeParticipants.map((p) => ({
      id: p.mem_id,
      name: (p.mem_mst as unknown as { mem_nm: string }).mem_nm,
    }));

    setMembers(memberList);
    setMileageData(mPoints);
    setPercentData(pPoints);
    setLoading(false);
  }, [evtId, memId, month]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  const chartData = mode === "mileage" ? mileageData : percentData;

  if (chartData.length === 0 || members.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-muted">
        <Body className="text-muted-foreground">아직 기록이 없습니다</Body>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SegmentControl
        segments={[
          { value: "mileage", label: "마일리지" },
          { value: "percent", label: "달성률" },
        ]}
        value={mode}
        onValueChange={setMode}
      />

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            domain={[1, totalDays]}
            tickFormatter={(d: number) => `${d}일`}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) =>
              mode === "percent" ? `${v}%` : `${v}`
            }
            width={36}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...props}
                myName={myName}
                mode={mode}
              />
            )}
          />
          {/* 목표 기준선 */}
          {mode === "mileage" && myGoalKm > 0 && (
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
          {mode === "percent" && (
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
          )}
          {members.map((member, i) => (
            <Line
              key={member.id}
              type="monotone"
              dataKey={member.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={member.name === myName ? 3 : 1.5}
              opacity={member.name === myName ? 1 : 0.65}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
