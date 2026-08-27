"use server";

import { withAdminOrThrow } from "@/lib/actions/auth";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminStats = {
  totalCount: number;
  activeCount: number;
  monthlyCompetitionCount: number;

  /**
   * 승인 대기 중인 모임 참가 신청 수 — **처리해야 할 건수**.
   * 대시보드 카드는 "이 달 모임이 몇 개인가"(구경거리)가 아니라 "내가 손댈 게 있나"에
   * 답해야 한다. 회비 미납·미처리 건의와 같은 성격이라 0보다 크면 빨갛게 뜬다.
   * **월 필터 없음** — 12월 송년회 신청은 10·11월에 들어온다.
   */
  pendingGatheringApplicationCount: number;
  recentRecordCount: number;
  activeProjectCount: number;
  pendingParticipationCount: number;
  unpaidMemberCount: number;
  openFeedbackCount: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  return withAdminOrThrow(async () => {
    const { teamId } = await getRequestTeamContext();
    const admin = createAdminClient();

    const [total, active, competitions, records, activeProjects, pendingPrt, unpaidResult, openFeedback, pendingAply] = await Promise.all([
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
      // 승인 대기 중인 모임 참가 신청 — **월 필터 없음**(다른 달 대기 건을 놓치지 않게).
      // 삭제된 모임의 잔여 신청은 처리할 일이 아니므로 gthr_mst 를 inner 로 걸어 걸러낸다.
      admin
        .from("gthr_aply_rel")
        .select("aply_id, gthr_mst!inner(team_id, del_yn)", { count: "exact", head: true })
        .eq("aply_st_cd", "pending")
        .eq("gthr_mst.team_id", teamId)
        .eq("gthr_mst.del_yn", false),
    ]);

    if (unpaidResult.error) console.error("[getAdminStats] unpaid count error:", unpaidResult.error);
    const unpaidMemberCount = (unpaidResult.data as number | null) ?? 0;

    return {
      totalCount: total.count ?? 0,
      activeCount: active.count ?? 0,
      monthlyCompetitionCount: competitions.count ?? 0,

      pendingGatheringApplicationCount: pendingAply.count ?? 0,
      recentRecordCount: records.count ?? 0,
      activeProjectCount: activeProjects.count ?? 0,
      pendingParticipationCount: pendingPrt.count ?? 0,
      unpaidMemberCount,
      openFeedbackCount: openFeedback.count ?? 0,
    };
  });
}
