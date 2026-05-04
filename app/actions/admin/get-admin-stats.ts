"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { env } from "@/lib/env";

export type AdminStats = {
  totalCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
  activeProjectCount: number;
  pendingParticipationCount: number;
  _debug?: Record<string, unknown>;
};

export async function getAdminStats(): Promise<AdminStats> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const { teamId, teamCd } = await getRequestTeamContext();
  const admin = createAdminClient();

  // 디버그: RLS 역할 확인 — team_id 필터 없이 카운트
  const noFilter = await admin.from("team_mem_rel").select("*", { count: "exact", head: true });
  const keyPrefix = env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 20);
  console.log("[getAdminStats] teamId:", teamId, "keyPrefix:", keyPrefix, "noFilterCount:", noFilter.count, "noFilterError:", noFilter.error);

  const [total, competitions, records, activeProjects, pendingPrt] = await Promise.all([
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
      .eq("stts_enm", "ACTIVE"),
    admin
      .from("evt_team_prt_rel")
      .select("evt_id, evt_team_mst!inner(team_id)", { count: "exact", head: true })
      .eq("aprv_yn", false)
      .eq("evt_team_mst.team_id", teamId),
  ]);

  const result: AdminStats = {
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
    activeProjectCount: activeProjects.count ?? 0,
    pendingParticipationCount: pendingPrt.count ?? 0,
    _debug: {
      teamId,
      teamCd,
      keyPrefix,
      noFilterCount: noFilter.count,
      noFilterError: noFilter.error,
      errors: {
        total: total.error,
        activeProjects: activeProjects.error,
        pendingPrt: pendingPrt.error,
      },
    },
  };
  return result;
}
