"use server";

import { revalidatePath } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { validateCancelReason } from "@/lib/gathering/cancel-reason";
import { joinGatheringWithCapCheck } from "@/lib/gathering/join-gathering";
import { isPastLockedFor } from "@/lib/past-event";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * 모임 참석 토글.
 * 참석 등록 시 `monthlyAttendCnt`(그 모임 stt_at 월 기준 본인 총참석 횟수)를 함께 반환해,
 * 클라이언트가 "이번 달 N회 참석" 토스트를 띄울 수 있게 한다. 취소 시엔 undefined.
 *
 * 취소 시 `reason`(선택)을 넘기면 취소 이력(gthr_attd_hist)에 사유로 저장된다.
 * SG-01 은 저장만 지원 — 사유 필수 강제는 후속 과제(SG-02). 등록 토글 시 reason 은 무시.
 */
export async function toggleGatheringAttendance(
  gthr_id: string,
  reason?: string,
): Promise<{ attending: boolean; monthlyAttendCnt?: number }> {
  return withActive(async ({ member, supabase }) => {
    // 모임 검증용 조회와 내 참석 여부 조회는 독립적 — 병렬 1 RTT로 (직렬 2 RTT 방지)
    const admin = createUntypedAdminClient();
    const { teamId } = await getRequestTeamContext();
    const [{ data: gthr }, { data: existing }] = await Promise.all([
      admin
        .from("gthr_mst")
        .select("max_prt_cnt, stt_at, end_at")
        .eq("gthr_id", gthr_id)
        .eq("team_id", teamId)
        .eq("del_yn", false)
        .single(),
      supabase
        .from("gthr_attd_rel")
        .select("attd_id")
        .eq("gthr_id", gthr_id)
        .eq("mem_id", member.id)
        .maybeSingle(),
    ]);

    if (!gthr) throw new Error("모임을 찾을 수 없습니다.");

    // 지난 모임(KST 날짜 기준)은 참석/참석해제 불가 — 관리자만 예외
    if (isPastLockedFor(member.admin, gthr.stt_at, gthr.end_at)) {
      throw new Error("지난 모임은 참석 변경이 불가합니다.");
    }

    if (existing) {
      // 사유 길이 상한(500자) 서버 강제 — 초과 시 잘라내지 않고 거부.
      const reasonCheck = validateCancelReason(reason);
      if (!reasonCheck.ok) throw new Error(reasonCheck.message);

      // 취소 = gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT 를 원자적으로.
      // cancel_gthr_attendance RPC 는 service_role 전용(authenticated·anon EXECUTE 회수)이라
      // 본인 인가가 끝난 admin 클라이언트로 호출한다. actor 는 본인(self).
      const { error: cancelError } = await admin.rpc("cancel_gthr_attendance", {
        p_gthr_id: gthr_id,
        p_mem_id: member.id,
        p_actor_cd: "self",
        p_actor_mem_id: member.id,
        p_reason: reasonCheck.value,
      });
      if (cancelError) throw new Error("참석 취소에 실패했습니다.");
      // 홈(/)은 dynamic 렌더(getCurrentMember가 cookies 사용)라 매 요청 새로 조회되므로
      // revalidatePath("/")는 무효화할 캐시가 없어 불필요 — 모임 상세 직접 URL만 무효화한다.
      revalidatePath(`/gatherings/${gthr_id}`);
      return { attending: false };
    }

    // 정원 재확인 + upsert는 온보딩(onboardingCreateMember)과 공유하는 유틸 사용
    // (모임 존재·지난모임잠금은 위에서 이미 검증했으므로 여기선 정원+upsert만 수행됨).
    // INSERT는 member의 RLS 클라이언트(supabase)로 — 참석 등록의 self-only insert 정책을
    // DB 레벨에서 유지한다(admin 우회 회귀 방지). 조회/정원은 admin으로.
    const joinResult = await joinGatheringWithCapCheck(admin, {
      gthrId: gthr_id,
      memId: member.id,
      teamId,
      isAdmin: member.admin,
      writeClient: supabase,
    });

    if (!joinResult.joined) {
      if (joinResult.reason === "full") throw new Error("인원이 마감됐습니다.");
      throw new Error("참석 등록에 실패했습니다.");
    }

    // 홈(/)은 dynamic이라 revalidate 불필요(위 취소 경로 주석 참고). 모임 상세 직접 URL만 무효화.
    revalidatePath(`/gatherings/${gthr_id}`);

    // 이번 달(모임 귀속월) 본인 총참석 횟수 — 토스트 안내용(실패해도 참석 등록엔 영향 없음)
    let monthlyAttendCnt: number | undefined;
    try {
      const ym = dayjs(gthr.stt_at).tz("Asia/Seoul").format("YYYY-MM");
      const { data: stat } = await admin.rpc("get_member_monthly_activity", {
        p_team_id: teamId,
        p_mem_id: member.id,
        p_ym: ym,
      });
      monthlyAttendCnt = stat?.[0]?.attend_cnt ?? undefined;
    } catch {
      monthlyAttendCnt = undefined;
    }

    return { attending: true, monthlyAttendCnt };
  });
}
