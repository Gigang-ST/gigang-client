"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/** createAdminClient는 RLS를 우회하므로, 대상 모임이 현재 팀 소속인지 서버에서 직접 확인한다 (IDOR 방지). */
async function verifyGatheringInTeam(
  db: ReturnType<typeof createAdminClient>,
  gthrId: string,
  teamId: string,
): Promise<boolean> {
  const { data } = await db
    .from("gthr_mst")
    .select("gthr_id")
    .eq("gthr_id", gthrId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();
  return !!data;
}

/** 관리자가 특정 모임에서 특정 멤버의 참석을 취소한다 (RLS 우회 — 본인 외 삭제 허용). */
export async function removeGatheringAttendance(gthrId: string, memId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const inTeam = await verifyGatheringInTeam(db, gthrId, teamId);
    if (!inTeam) return { ok: false, message: "모임을 찾을 수 없습니다" };

    const { error } = await db
      .from("gthr_attd_rel")
      .delete()
      .eq("gthr_id", gthrId)
      .eq("mem_id", memId);
    if (error) return { ok: false, message: "참석 취소에 실패했습니다" };
    return { ok: true, message: null };
  });
}

/** 관리자가 특정 모임에 특정 멤버의 참석을 등록한다 (RLS 우회 — 본인 외 등록 허용). */
export async function addGatheringAttendance(gthrId: string, memId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const inTeam = await verifyGatheringInTeam(db, gthrId, teamId);
    if (!inTeam) return { ok: false, message: "모임을 찾을 수 없습니다" };

    const { data: memRel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active")
      .maybeSingle();
    if (!memRel) return { ok: false, message: "추가할 수 없는 멤버입니다" };

    const { error } = await db
      .from("gthr_attd_rel")
      .upsert({ gthr_id: gthrId, mem_id: memId }, { onConflict: "gthr_id,mem_id", ignoreDuplicates: true });
    if (error) return { ok: false, message: "참석 추가에 실패했습니다" };
    return { ok: true, message: null };
  });
}
