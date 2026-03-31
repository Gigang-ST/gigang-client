"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";

export type AdminStats = {
  pendingCount: number;
  activeCount: number;
  totalCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const admin = createAdminClient();

  const [pending, active, total, competitions, records] = await Promise.all([
    admin
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    admin.from("member").select("*", { count: "exact", head: true }),
    (() => {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
      return admin
        .from("competition")
        .select("*", { count: "exact", head: true })
        .gte("start_date", monthStart)
        .lt("start_date", monthEnd);
    })(),
    admin
      .from("race_result")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    pendingCount: pending.count ?? 0,
    activeCount: active.count ?? 0,
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
  };
}
