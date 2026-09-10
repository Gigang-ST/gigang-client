"use server";

import { after } from "next/server";

import { withAdmin, withAdminOrThrow } from "@/lib/actions/auth";
import { validateCancelReason } from "@/lib/gathering/cancel-reason";
import { insertNoti } from "@/lib/notifications/insert-noti";
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

/** 승인제 모임인가 — 대리 추가·취소가 gthr_aply_rel 까지 손봐야 하는지 가른다. */
async function isApprovalGathering(
  db: ReturnType<typeof createAdminClient>,
  gthrId: string,
  teamId: string,
): Promise<boolean> {
  const { data } = await db
    .from("gthr_mst")
    .select("aprv_req_yn")
    .eq("gthr_id", gthrId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();
  return !!(data as { aprv_req_yn?: boolean } | null)?.aprv_req_yn;
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

    // 승인제 모임이면 참석만 지워선 안 된다 — gthr_aply_rel 이 approved 로 남아
    // 신청 관리 목록엔 확정으로 보이는데 참석자엔 없는 유령이 된다.
    // cancel_gthr_application 이 두 테이블을 한 트랜잭션으로 정리한다.
    if (await isApprovalGathering(db, gthrId, teamId)) {
      const { data, error } = await untyped.rpc("cancel_gthr_application", {
        p_gthr_id: gthrId,
        p_mem_id: memId,
        p_team_id: teamId,
        p_actor_cd: "admin",
        p_actor_mem_id: member.id,
        p_reason: reasonCheck.value,
      });
      if (error) return { ok: false, message: "참석 취소에 실패했습니다" };
      if (data !== "ok") return { ok: false, message: "취소할 참석 내역이 없습니다" };
      return { ok: true, message: null };
    }

    // RPC 가 취소·이력·**대기열 승급**을 한 트랜잭션으로 처리하고 승급된 mem_id 를 돌려준다.
    const { data: promotedRaw, error } = await untyped.rpc("cancel_gthr_attendance", {
      p_gthr_id: gthrId,
      p_mem_id: memId,
      p_actor_cd: "admin",
      p_actor_mem_id: member.id,
      p_reason: reasonCheck.value,
    });
    if (error) return { ok: false, message: "참석 취소에 실패했습니다" };

    // 운영진이 뺀 것도 자리가 나는 사건이다 — 올라온 사람은 알아야 한다.
    // 취소 자체는 이미 끝났으므로 알림 실패가 결과를 바꾸지 않는다(응답 밖에서 돈다).
    const promoted: string[] = Array.isArray(promotedRaw) ? promotedRaw : [];
    if (promoted.length) {
      const { data: gthrRow } = await db
        .from("gthr_mst")
        .select("gthr_nm")
        .eq("gthr_id", gthrId)
        .maybeSingle();
      const gthrNm = gthrRow?.gthr_nm ?? "모임";
      after(async () => {
        await Promise.all(
          promoted.map((promotedMemId) =>
            insertNoti({
              teamId,
              memId: promotedMemId,
              notiTypeEnm: "gthr_promo",
              notiNm: `'${gthrNm}' 자리가 나서 참석이 확정됐어요`,
              notiCont: "대기 중이던 모임에 자리가 생겨 자동으로 참석 처리했어요.",
              refId: gthrId,
              refTypeEnm: "gathering",
            }).catch((e) => console.error("[gthr_promo] 알림 발송 실패", e)),
          ),
        );
      });
    }

    return { ok: true, message: null };
  });
}

/**
 * 관리자가 특정 모임에 특정 멤버의 참석을 등록한다 (RLS 우회 — 본인 외 등록 허용).
 *
 * **참여조건이 하드 게이트라 이 문이 조건 미달자의 유일한 예외 구제 경로다.**
 * 그래서 조건도 정원도 보지 않는다 — 여기서 막으면 구제 자체가 성립하지 않는다.
 */
export async function addGatheringAttendance(gthrId: string, memId: string) {
  return withAdmin(async ({ member }) => {
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

    // 승인제 모임이면 gthr_aply_rel 에 approved 행도 함께 만들어야 한다 — 안 하면
    // 신청 관리 목록엔 안 보이는데 정원엔 잡히는 유령 확정자가 된다. RPC 가 둘을 묶는다.
    const untyped = createUntypedAdminClient();
    const { data, error } = await untyped.rpc("admin_add_gthr_attendance", {
      p_gthr_id: gthrId,
      p_mem_id: memId,
      p_team_id: teamId,
      p_actor_mem_id: member.id,
    });
    if (error || data !== "ok") return { ok: false, message: "참석 추가에 실패했습니다" };
    return { ok: true, message: null };
  });
}

/** 대기 명단 한 줄 — 관리자 모임 화면 "바로 추가" 표면. */
export type GatheringWaitlistRow = {
  mem_id: string;
  wait_at: string;
  mem_nm: string | null;
  avatar_url: string | null;
};

/**
 * 대기 명단 조회 — `wait_st_cd = 'waiting'` 행만.
 *
 * `gthr_wait_rel` 은 신규 테이블이라 아직 database.types.ts 에 없다 → untyped 관리자
 * 클라이언트로 조회한다(gen types 후 typed 클라이언트로 교체 예정). FK 는 mem_id → mem_mst
 * 하나뿐이라(gthr_aply_rel 과 달리 mem_id/rvw_by 둘이 아니다) 임베드에 별도 FK 이름
 * 지정이 필요 없다.
 */
export async function listGatheringWaitlist(gthrId: string): Promise<GatheringWaitlistRow[]> {
  return withAdminOrThrow(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const inTeam = await verifyGatheringInTeam(db, gthrId, teamId);
    if (!inTeam) return [];

    const untyped = createUntypedAdminClient();
    const { data, error } = await untyped
      .from("gthr_wait_rel")
      .select("mem_id, wait_at, mem_mst(mem_nm, avatar_url)")
      .eq("gthr_id", gthrId)
      .eq("wait_st_cd", "waiting");

    if (error) {
      console.error("[gthr-waitlist] 대기 명단 조회 실패", error.message);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => {
      const m = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
      return {
        mem_id: row.mem_id as string,
        wait_at: row.wait_at as string,
        mem_nm: (m?.mem_nm as string | null) ?? null,
        avatar_url: (m?.avatar_url as string | null) ?? null,
      };
    });
  });
}
