"use server";

import { withAdminOrThrow } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { batchEvaluateAndGrant } from "@/lib/titles/engine";
import { createAdminClient } from "@/lib/supabase/admin";

const KST = "Asia/Seoul";

export async function batchMileageTitles(evtId: string, baseMonth?: string): Promise<string> {
  return withAdminOrThrow(async () => {
    const db = createAdminClient();

    const resolvedMonth = baseMonth
      ? baseMonth
      : dayjs().tz(KST).subtract(1, "month").format("YYYY-MM");

    const baseMonthStart = `${resolvedMonth}-01`;
    const baseMonthLastDay = dayjs(baseMonthStart).tz(KST).endOf("month").format("YYYY-MM-DD");

    const { data: prtRows, error } = await db
      .from("evt_team_prt_rel")
      .select("mem_id, evt_id, evt_team_mst!inner(team_id, stt_dt, end_dt)")
      .eq("evt_id", evtId)
      .eq("aprv_yn", true)
      .lte("evt_team_mst.stt_dt", baseMonthLastDay)
      .gte("evt_team_mst.end_dt", baseMonthStart);

    if (error || !prtRows?.length) {
      return `평가 대상 참여자 없음 (기준 월: ${resolvedMonth})`;
    }

    const memIds = [...new Set(prtRows.map((r) => r.mem_id))];
    const evtTeamIds = [...new Set(prtRows.map((r) => {
      const evtMst = Array.isArray(r.evt_team_mst) ? r.evt_team_mst[0] : r.evt_team_mst;
      return (evtMst as { team_id: string }).team_id;
    }))];

    const { data: teamMemRows } = await db
      .from("team_mem_rel")
      .select("mem_id, team_mem_id, team_id")
      .in("mem_id", memIds)
      .in("team_id", evtTeamIds)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (!teamMemRows?.length) return `팀 멤버 매핑 실패 (기준 월: ${resolvedMonth})`;

    const memEvtMap = new Map<string, string>();
    for (const r of prtRows) memEvtMap.set(r.mem_id, r.evt_id);

    const teamMap = new Map<string, { teamMemIds: string[]; evtId: string }>();
    for (const r of teamMemRows) {
      const evtId = memEvtMap.get(r.mem_id) ?? "";
      if (!teamMap.has(r.team_id)) teamMap.set(r.team_id, { teamMemIds: [], evtId });
      teamMap.get(r.team_id)!.teamMemIds.push(r.team_mem_id);
    }

    let totalGranted = 0;
    for (const [teamId, { teamMemIds, evtId }] of teamMap.entries()) {
      const { granted } = await batchEvaluateAndGrant(teamId, teamMemIds, resolvedMonth, evtId);
      totalGranted += granted;
    }

    return `${memIds.length}명 평가 완료, ${totalGranted}개 칭호 부여 (기준 월: ${resolvedMonth})`;
  });
}
