"use client";

import { useEffect, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { useChartMode } from "./chart-mode-context";

type DailyPoint = { day: number; [key: string]: number };

const CHART_COLORS = [
  "#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
];

type Props = {
  projectId: string;
  participationId?: string;
  month?: string; // "2026-05-01"
  refreshKey?: number;
};

export function CrewProgressChart({ projectId, participationId, month, refreshKey }: Props) {
  const { mode, setMode } = useChartMode();
  const [mileageData, setMileageData] = useState<DailyPoint[]>([]);
  const [percentData, setPercentData] = useState<DailyPoint[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [goalKm, setGoalKm] = useState<number>(0);
  const [myName, setMyName] = useState<string | null>(null);
  const [totalDays, setTotalDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();

      // 선택된 월 결정
      const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
      );
      const selectedMonth =
        month ??
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const [y, m] = selectedMonth.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      setTotalDays(daysInMonth);

      const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      // 참여자 + 기록 조회
      const { data: participations } = await supabase
        .from("project_participation")
        .select(
          "id, member:member_id(full_name), activity_log!inner(activity_date, final_mileage)",
        )
        .eq("project_id", projectId)
        .eq("deposit_confirmed", true)
        .gte("activity_log.activity_date", selectedMonth)
        .lte("activity_log.activity_date", monthEnd);

      // inner join 때문에 기록 없는 참여자는 빠짐 → 별도 조회
      const { data: allParticipations } = await supabase
        .from("project_participation")
        .select("id, initial_goal, member:member_id(full_name)")
        .eq("project_id", projectId)
        .eq("deposit_confirmed", true);

      // 참여자별 목표 조회
      const allPIds = (allParticipations ?? []).map((p) => p.id);
      const { data: goals } = await supabase
        .from("mileage_goal")
        .select("participation_id, goal_km")
        .in("participation_id", allPIds)
        .eq("month", selectedMonth);

      const goalByPId = new Map<string, number>();
      for (const g of goals ?? []) {
        goalByPId.set(g.participation_id as string, Number(g.goal_km));
      }

      // 본인 목표 & 이름
      if (participationId) {
        setGoalKm(goalByPId.get(participationId) ?? 0);
        const myP = (allParticipations ?? []).find((p) => p.id === participationId);
        if (myP) {
          setMyName((myP.member as unknown as { full_name: string }).full_name);
        }
      }

      // 해당 월에 목표가 있거나 기록이 있는 참여자 표시
      const pIdsWithLogs = new Set(
        (participations ?? []).map((p) => p.id),
      );
      const activePIds = new Set([...goalByPId.keys(), ...pIdsWithLogs]);
      const filteredParticipations = (allParticipations ?? []).filter((p) =>
        activePIds.has(p.id),
      );

      // 참여자별 일별 누적 마일리지 계산
      const memberNames: string[] = [];
      const dailyCumByMember = new Map<string, Map<number, number>>();

      for (const p of filteredParticipations) {
        const member = p.member as unknown as { full_name: string };
        const name = member.full_name;
        if (!memberNames.includes(name)) memberNames.push(name);

        const logs =
          (participations ?? [])
            .find((pp) => pp.id === p.id)
            ?.activity_log as { activity_date: string; final_mileage: number }[] ?? [];

        const sorted = [...logs].sort((a, b) =>
          a.activity_date.localeCompare(b.activity_date),
        );

        const dayMap = new Map<number, number>();
        let cumulative = 0;
        for (const log of sorted) {
          const day = Number(log.activity_date.split("-")[2]);
          cumulative += Number(log.final_mileage);
          dayMap.set(day, Number(cumulative.toFixed(2)));
        }
        dailyCumByMember.set(name, dayMap);
      }

      // 1일~말일 데이터 생성
      const mPoints: DailyPoint[] = [];
      const pPoints: DailyPoint[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const mPoint: DailyPoint = { day: d };
        const pPoint: DailyPoint = { day: d };

        for (const name of memberNames) {
          const dayMap = dailyCumByMember.get(name);
          // 해당 일까지의 최신 누적값
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
          const matchedP = filteredParticipations.find(
            (p) => (p.member as unknown as { full_name: string }).full_name === name,
          );
          const goal = goalByPId.get(matchedP?.id ?? "")
            ?? (matchedP as unknown as { initial_goal?: number })?.initial_goal
            ?? 0;
          pPoint[name] = goal > 0 ? Number(Math.min((val / goal) * 100, 100).toFixed(1)) : 0;
        }

        mPoints.push(mPoint);
        pPoints.push(pPoint);
      }

      setMembers(memberNames);
      setMileageData(mPoints);
      setPercentData(pPoints);
      setLoading(false);
    }
    load();
  }, [projectId, participationId, month, refreshKey]);

  if (loading) {
    return <div className="h-64 rounded-xl bg-muted animate-pulse" />;
  }

  const chartData = mode === "mileage" ? mileageData : percentData;
  if (chartData.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">크루 진행현황</h2>
        <div className="flex rounded-lg border text-xs">
          <button
            onClick={() => setMode("mileage")}
            className={`px-3 py-1.5 rounded-l-lg transition-colors ${
              mode === "mileage"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            마일리지
          </button>
          <button
            onClick={() => setMode("percent")}
            className={`px-3 py-1.5 rounded-r-lg transition-colors ${
              mode === "percent"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            달성률
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11 }}
            domain={[1, totalDays]}
            tickFormatter={(d) => `${d}일`}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => (mode === "percent" ? `${v}%` : `${v}`)}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const sorted = [...payload].sort(
                (a, b) => Number(b.value) - Number(a.value),
              );
              const top = sorted.slice(0, 5);
              // 자신이 상위 5명에 없으면 추가
              const meInTop = myName ? top.find((e) => e.name === myName) : null;
              const meEntry = !meInTop && myName ? sorted.find((e) => e.name === myName) : null;
              if (meEntry) top.push(meEntry);
              const rest = sorted.length - top.length;
              return (
                <div className="rounded-lg border bg-white p-2 text-xs shadow-md max-w-[180px]">
                  <p className="font-semibold mb-1">{label}일</p>
                  {top.map((entry) => (
                    <div key={entry.name} className="flex justify-between gap-3" style={{ color: entry.color as string }}>
                      <span className="truncate">{entry.name}</span>
                      <span className="font-medium">
                        {mode === "percent" ? `${entry.value}%` : Number(entry.value).toFixed(1)}
                      </span>
                    </div>
                  ))}
                  {rest > 0 && (
                    <p className="text-muted-foreground mt-1">외 {rest}명</p>
                  )}
                </div>
              );
            }}
          />
          {mode === "mileage" && goalKm > 0 && (
            <ReferenceLine
              y={goalKm}
              stroke="#9ca3af"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `목표 ${goalKm}`,
                position: "right",
                fontSize: 10,
                fill: "#9ca3af",
              }}
            />
          )}
          {mode === "percent" && (
            <ReferenceLine
              y={100}
              stroke="#9ca3af"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: "100%",
                position: "right",
                fontSize: 10,
                fill: "#9ca3af",
              }}
            />
          )}
          {members.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
