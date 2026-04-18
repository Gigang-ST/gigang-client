"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export type AdminStats = {
  totalCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const { teamId } = await getRequestTeamContext();
  const admin = createAdminClient();

  const [total, competitions, records] = await Promise.all([
    admin
      .from("team_mem_rel")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
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
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
  };
}
