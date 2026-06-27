"use server";

import { withAdminOrThrow } from "@/lib/actions/auth";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";
import { env } from "@/lib/env";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminStats = {
  totalCount: number;
  activeCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
  activeProjectCount: number;
  pendingParticipationCount: number;
  unpaidMemberCount: number;
  openFeedbackCount: number;
  _debug?: Record<string, unknown>;
};

export async function getAdminStats(): Promise<AdminStats> {
  return withAdminOrThrow(async () => {
    const { teamId, teamCd } = await getRequestTeamContext();
    const admin = createAdminClient();

    const noFilter = await admin.from("team_mem_rel").select("*", { count: "exact", head: true });
    const keyPrefix = env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 20);
    console.log("[getAdminStats] teamId:", teamId, "keyPrefix:", keyPrefix, "noFilterCount:", noFilter.count, "noFilterError:", noFilter.error);

    const [total, active, competitions, records, activeProjects, pendingPrt, unpaidResult, openFeedback] = await Promise.all([
      admin.from("team_mem_rel").select("*", { count: "exact", head: true }).eq("team_id", teamId).eq("vers", 0).eq("del_yn", false)
        .then((res) => { if (res.error) console.error("[getAdminStats] team_mem_rel error:", res.error, "teamId:", teamId); return res; }),
      admin.from("team_mem_rel").select("*", { count: "exact", head: true }).eq("team_id", teamId).eq("vers", 0).eq("del_yn", false).eq("mem_st_cd", "active"),
      (() => {
        const monthStart = currentMonthKST();
        const monthEnd = nextMonthStr(monthStart);
        return admin.from("comp_mst").select("*", { count: "exact", head: true }).eq("vers", 0).eq("del_yn", false).gte("stt_dt", monthStart).lt("stt_dt", monthEnd);
      })(),
      admin.from("rec_race_hist").select("*", { count: "exact", head: true }).eq("vers", 0).eq("del_yn", false),
      admin.from("evt_team_mst").select("*", { count: "exact", head: true }).eq("team_id", teamId).eq("stts_enm", "ACTIVE"),
      admin.from("evt_team_prt_rel").select("evt_id, evt_team_mst!inner(team_id)", { count: "exact", head: true }).eq("aprv_yn", false).eq("evt_team_mst.team_id", teamId),
      admin.rpc("get_admin_unpaid_active_count", { p_team_id: teamId }),
      admin.from("fdbk_mst").select("*", { count: "exact", head: true }).in("stts_enm", ["open", "in_review"]).eq("vers", 0).eq("del_yn", false),
    ]);

    if (unpaidResult.error) console.error("[getAdminStats] unpaid count error:", unpaidResult.error);
    const unpaidMemberCount = (unpaidResult.data as number | null) ?? 0;

    return {
      totalCount: total.count ?? 0,
      activeCount: active.count ?? 0,
      monthlyCompetitionCount: competitions.count ?? 0,
      recentRecordCount: records.count ?? 0,
      activeProjectCount: activeProjects.count ?? 0,
      pendingParticipationCount: pendingPrt.count ?? 0,
      unpaidMemberCount,
      openFeedbackCount: openFeedback.count ?? 0,
      _debug: {
        teamId, teamCd, keyPrefix,
        noFilterCount: noFilter.count, noFilterError: noFilter.error,
        errors: { total: total.error, activeProjects: activeProjects.error, pendingPrt: pendingPrt.error },
      },
    };
  });
}
