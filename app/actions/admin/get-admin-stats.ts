"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";
import { GIGANG_TEAM_ID } from "@/lib/constants/gigang-team";

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
      .from("team_mem_rel")
      .select("*", { count: "exact", head: true })
      .eq("team_id", GIGANG_TEAM_ID)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "pending"),
    admin
      .from("team_mem_rel")
      .select("*", { count: "exact", head: true })
      .eq("team_id", GIGANG_TEAM_ID)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active"),
    admin
      .from("team_mem_rel")
      .select("*", { count: "exact", head: true })
      .eq("team_id", GIGANG_TEAM_ID)
      .eq("vers", 0)
      .eq("del_yn", false),
    (() => {
      const monthStart = currentMonthKST();
      const monthEnd = nextMonthStr(monthStart);
      return admin
        .from("comp_mst")
        .select("*", { count: "exact", head: true })
        .eq("vers", 0)
        .eq("del_yn", false)
        .gte("stt_dt", monthStart)
        .lt("stt_dt", monthEnd);
    })(),
    admin
      .from("rec_race_hist")
      .select("*", { count: "exact", head: true })
      .eq("vers", 0)
      .eq("del_yn", false),
  ]);

  return {
    pendingCount: pending.count ?? 0,
    activeCount: active.count ?? 0,
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
  };
}
