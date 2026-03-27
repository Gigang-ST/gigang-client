"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminStats = {
  pendingCount: number;
  activeCount: number;
  totalCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
  activeEventCount: number;
  activeProjectCount: number;
  pendingParticipationCount: number;
  confirmedParticipationCount: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다");

  const { data: me } = await supabase
    .from("member")
    .select("admin")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!me?.admin) throw new Error("권한이 없습니다");

  const admin = createAdminClient();

  const [pending, active, total, competitions, records, activeEvents, activeProjects, pendingParticipations, confirmedParticipations] =
    await Promise.all([
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
      admin
        .from("event_multiplier")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      admin
        .from("project")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      admin
        .from("project_participation")
        .select("*", { count: "exact", head: true })
        .eq("deposit_confirmed", false),
      admin
        .from("project_participation")
        .select("*", { count: "exact", head: true })
        .eq("deposit_confirmed", true),
    ]);

  return {
    pendingCount: pending.count ?? 0,
    activeCount: active.count ?? 0,
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
    activeEventCount: activeEvents.count ?? 0,
    activeProjectCount: activeProjects.count ?? 0,
    pendingParticipationCount: pendingParticipations.count ?? 0,
    confirmedParticipationCount: confirmedParticipations.count ?? 0,
  };
}
