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
  Legend,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

type DailyPoint = { date: string; [memberName: string]: string | number };

const CHART_COLORS = [
  "#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
];

export function CrewProgressChart({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DailyPoint[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: participations } = await supabase
        .from("project_participation")
        .select(
          "id, member:member_id(full_name), activity_log(activity_date, final_mileage)",
        )
        .eq("project_id", projectId)
        .eq("deposit_confirmed", true);

      if (!participations) {
        setLoading(false);
        return;
      }

      const memberNames: string[] = [];
      const cumulativeByMember = new Map<string, number>();
      const dailyMap = new Map<string, Record<string, number>>();

      for (const p of participations) {
        const member = p.member as unknown as { full_name: string };
        const name = member.full_name;
        memberNames.push(name);
        cumulativeByMember.set(name, 0);

        const sorted = [
          ...(p.activity_log as { activity_date: string; final_mileage: number }[]),
        ].sort((a, b) => a.activity_date.localeCompare(b.activity_date));

        for (const log of sorted) {
          const prev = cumulativeByMember.get(name) ?? 0;
          const cumulative = prev + Number(log.final_mileage);
          cumulativeByMember.set(name, cumulative);
          const existing = dailyMap.get(log.activity_date) ?? {};
          dailyMap.set(log.activity_date, {
            ...existing,
            [name]: Number(cumulative.toFixed(2)),
          });
        }
      }

      const sortedDates = Array.from(dailyMap.keys()).sort();
      const lastValues: Record<string, number> = {};
      const points: DailyPoint[] = sortedDates.map((date) => {
        const dayData = dailyMap.get(date)!;
        for (const name of memberNames) {
          if (dayData[name] !== undefined) lastValues[name] = dayData[name];
        }
        return {
          date: date.slice(5),
          ...Object.fromEntries(memberNames.map((n) => [n, lastValues[n] ?? 0])),
        };
      });

      setMembers(memberNames);
      setData(points);
      setLoading(false);
    }
    load();
  }, [projectId]);

  if (loading) {
    return <div className="h-64 rounded-xl bg-muted animate-pulse" />;
  }
  if (data.length === 0) return null;

  return (
    <section className="rounded-xl border p-5">
      <h2 className="mb-4 font-semibold text-lg">전체 크루원 진행 현황</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
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
    </section>
  );
}
