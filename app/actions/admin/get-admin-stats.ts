"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export type AdminStats = {
  totalCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
  activeProjectCount: number;
  activeEventCount: number;
  pendingParticipationCount: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const { teamId, teamCd } = await getRequestTeamContext();
  console.log("[getAdminStats] teamId:", teamId, "teamCd:", teamCd);
  const admin = createAdminClient();

  const [total, competitions, records, activeProjects, activeEvents, pendingPrt] = await Promise.all([
    admin
      .from("team_mem_rel")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .then((res) => {
        if (res.error) console.error("[getAdminStats] team_mem_rel error:", res.error, "teamId:", teamId);
        return res;
      }),
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
    admin
      .from("evt_team_mst")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("status_cd", "ACTIVE"),
    admin
      .from("evt_mlg_mult_cfg")
      .select("evt_id, evt_team_mst!inner(team_id)", { count: "exact", head: true })
      .eq("active_yn", true)
      .eq("evt_team_mst.team_id", teamId),
    admin
      .from("evt_team_prt_rel")
      .select("evt_id, evt_team_mst!inner(team_id)", { count: "exact", head: true })
      .eq("approve_yn", false)
      .eq("evt_team_mst.team_id", teamId),
  ]);

  const result = {
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
    activeProjectCount: activeProjects.count ?? 0,
    activeEventCount: activeEvents.count ?? 0,
    pendingParticipationCount: pendingPrt.count ?? 0,
  };
  console.log("[getAdminStats] results:", result, "errors:", {
    total: total.error,
    activeProjects: activeProjects.error,
    activeEvents: activeEvents.error,
    pendingPrt: pendingPrt.error,
  });
  return result;
}
