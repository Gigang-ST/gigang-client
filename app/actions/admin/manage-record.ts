"use server";

import { withAdmin } from "@/lib/actions/auth";
import { isMemIdInTeam } from "@/lib/actions/team-scope";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 대회 기록은 **사람 것**이다(팀에 속하지 않는다). 그래서 관리자는 "기록 주인이 자기 팀 회원일 때"만
 * 고칠 수 있다 — 두 팀 소속자의 기록은 어느 팀 관리자가 고쳐도 양쪽에 반영된다(의도).
 * 예전엔 id 만으로 찾아 아무 팀 관리자나 아무 회원의 기록을 고치고 지울 수 있었다.
 */
async function recordOwnerInTeam(
  db: ReturnType<typeof createAdminClient>,
  recordId: string,
): Promise<boolean> {
  const { teamId } = await getRequestTeamContext();
  const { data } = await db
    .from("rec_race_hist")
    .select("mem_id")
    .eq("race_result_id", recordId)
    .maybeSingle();
  if (!data?.mem_id) return false;
  return isMemIdInTeam(db, teamId, data.mem_id);
}

export async function deleteRecord(recordId: string) {
  return withAdmin(async () => {
    const db = createAdminClient();
    if (!(await recordOwnerInTeam(db, recordId))) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const { error } = await db.from("rec_race_hist").delete().eq("race_result_id", recordId);
    if (error) return { ok: false, message: "삭제에 실패했습니다" };
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
  return withAdmin(async () => {
    const db = createAdminClient();
    if (!(await recordOwnerInTeam(db, recordId))) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const { error } = await db
      .from("rec_race_hist")
      .update({
        rec_time_sec: input.recordTimeSec,
        race_nm: input.raceName.trim(),
        race_dt: input.raceDate,
      })
      .eq("race_result_id", recordId);
    if (error) return { ok: false, message: "수정에 실패했습니다" };
    return { ok: true, message: null };
  });
}
