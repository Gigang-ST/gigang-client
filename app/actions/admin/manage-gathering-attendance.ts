"use server";

import { withAdmin } from "@/lib/actions/auth";
import { validateCancelReason } from "@/lib/gathering/cancel-reason";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient, createUntypedAdminClient } from "@/lib/supabase/admin";

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

/**
 * 관리자가 특정 모임에서 특정 멤버의 참석을 취소한다 (RLS 우회 — 본인 외 삭제 허용).
 * 취소 = gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT 를 원자적으로 처리한다.
 * `reason`(선택)을 넘기면 취소 사유로 이력에 저장된다(저장만, 필수 강제는 후속 SG-02).
 */
export async function removeGatheringAttendance(gthrId: string, memId: string, reason?: string) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const inTeam = await verifyGatheringInTeam(db, gthrId, teamId);
    if (!inTeam) return { ok: false, message: "모임을 찾을 수 없습니다" };

    // 사유 길이 상한(500자) 서버 강제 — 초과 시 잘라내지 않고 거부.
    const reasonCheck = validateCancelReason(reason);
    if (!reasonCheck.ok) return { ok: false, message: reasonCheck.message };

    // cancel_gthr_attendance RPC 는 service_role 전용. actor 는 처리한 관리자(admin).
    // 신규 RPC 라 아직 DB 타입 미생성 → untyped 관리자 클라이언트로 호출(gen types 후 교체 예정).
    const untyped = createUntypedAdminClient();
    const { error } = await untyped.rpc("cancel_gthr_attendance", {
      p_gthr_id: gthrId,
      p_mem_id: memId,
      p_actor_cd: "admin",
      p_actor_mem_id: member.id,
      p_reason: reasonCheck.value,
    });
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
