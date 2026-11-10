"use server";

import { after } from "next/server";

import { revalidateTag } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { isMemIdInTeam } from "@/lib/actions/team-scope";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { syncPersonRecordToOtherTeams } from "@/lib/records-revalidate";
import { createAdminClient, createAdminClientAs } from "@/lib/supabase/admin";

/**
 * 대회 기록은 **사람 것**이다(팀에 속하지 않는다). 그래서 관리자는 "기록 주인이 자기 팀 회원일 때"만
 * 고칠 수 있다 — 두 팀 소속자의 기록은 어느 팀 관리자가 고쳐도 양쪽에 반영된다(의도).
 * 예전엔 id 만으로 찾아 아무 팀 관리자나 아무 회원의 기록을 고치고 지울 수 있었다.
 */
async function recordOwnerInTeam(
  db: ReturnType<typeof createAdminClient>,
  teamId: string,
  recordId: string,
): Promise<string | null> {
  const { data } = await db
    .from("rec_race_hist")
    .select("mem_id")
    .eq("race_result_id", recordId)
    .maybeSingle();
  if (!data?.mem_id) return null;
  return (await isMemIdInTeam(db, teamId, data.mem_id)) ? data.mem_id : null;
}

/**
 * 기록이 바뀌면 전당(랭킹) 캐시를 턴다 — 이 팀 것 + 그 사람이 속한 다른 팀 것(기록은 사람 것).
 * 안 털면 관리자가 고친 기록이 전당에 최대 24시간 옛 값으로 남는다(회원이 직접 고칠 때와 같은 처리).
 */
async function refreshRankings(teamId: string, memId: string) {
  revalidateTag(`records:${teamId}`, "max");
  after(() => syncPersonRecordToOtherTeams(memId, teamId));
}

export async function deleteRecord(recordId: string) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    // 행위자를 실어 보낸다 — 지운 기록 전체가 변경 이력(chg_hist)에 "누가·어느 팀 관리자로" 남아 복구할 수 있다
    const db = createAdminClientAs({ memId: member.id, teamId });
    const ownerMemId = await recordOwnerInTeam(db, teamId, recordId);
    if (!ownerMemId) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const { error } = await db.from("rec_race_hist").delete().eq("race_result_id", recordId);
    if (error) return { ok: false, message: "삭제에 실패했습니다" };
    await refreshRankings(teamId, ownerMemId);
    return { ok: true, message: null };
  });
}

export async function updateRecord(
  recordId: string,
  input: {
    recordTimeSec: number;
    raceName: string;
    raceDate: string;
  },
) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClientAs({ memId: member.id, teamId });
    const ownerMemId = await recordOwnerInTeam(db, teamId, recordId);
    if (!ownerMemId) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const { error } = await db
      .from("rec_race_hist")
      .update({
        rec_time_sec: input.recordTimeSec,
        race_nm: input.raceName.trim(),
        race_dt: input.raceDate,
      })
      .eq("race_result_id", recordId);
    if (error) return { ok: false, message: "수정에 실패했습니다" };
    await refreshRankings(teamId, ownerMemId);
    return { ok: true, message: null };
  });
}
