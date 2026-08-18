"use server";

import { revalidatePath } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { CANCEL_REASON_REQUIRED_MESSAGE, isCancelReasonRequired } from "@/lib/gathering/cancel-imminent";
import { validateCancelReason } from "@/lib/gathering/cancel-reason";
import { joinGatheringWithCapCheck } from "@/lib/gathering/join-gathering";
import { insertNoti } from "@/lib/notifications/insert-noti";
import { isPastLockedFor } from "@/lib/past-event";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

/**
 * 모임 참석 토글.
 * 참석 등록 시 `monthlyAttendCnt`(그 모임 stt_at 월 기준 본인 총참석 횟수)를 함께 반환해,
 * 클라이언트가 "이번 달 N회 참석" 토스트를 띄울 수 있게 한다. 취소 시엔 undefined.
 *
 * 취소 시 `reason`(선택 또는 필수)을 넘기면 취소 이력(gthr_attd_hist)에 사유로 저장된다.
 * 모임 시작 GATHERING_CANCEL_IMMINENT_HOURS 시간 전부터의 취소는 사유가 필수다(클라이언트 모달
 * 뿐 아니라 여기서도 재검증 — 클라이언트를 신뢰하지 않음). 등록 토글 시 reason 은 무시.
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
        .select("max_prt_cnt, stt_at, end_at, gthr_nm, crt_by")
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

      // 임박 취소(시작 5시간 전부터)는 사유 필수 — 클라이언트 모달을 우회한 호출도 서버에서 재차 막는다.
      // 클라가 시각 차로 "선택"으로 보고 사유 없이 보내면 여기서 거절되고, 클라는 이 메시지를 식별해
      // 취소 모달을 사유 필수 모드로 전환한다(CANCEL_REASON_REQUIRED_MESSAGE 공유).
      if (isCancelReasonRequired(gthr.stt_at) && !reasonCheck.value) {
        throw new Error(CANCEL_REASON_REQUIRED_MESSAGE);
      }

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

      // 모임장(개설자)에게 취소 알림 — 본인이 자기 모임을 취소한 경우엔 자기 자신에게 보내지 않는다.
      // 알림은 부가 기능이라 실패해도 이미 완료된 취소 자체는 되돌리지 않는다(insertNoti 실패는 내부에서 로깅만).
      // 수신거부는 gthr_cncl 자체 설정으로 판단한다 — 모임 수정·삭제(gthr_upd)와는 별개 항목으로,
      // 알림 설정 UI의 "내 모임 참석 취소" 토글로 제어한다. prefTypeEnm 미지정 시 insertNoti가
      // notiTypeEnm(gthr_cncl)으로 수신거부를 판단한다.
      if (gthr.crt_by && gthr.crt_by !== member.id) {
        try {
          await insertNoti({
            teamId,
            memId: gthr.crt_by,
            notiTypeEnm: "gthr_cncl",
            notiNm: `${member.full_name}님이 '${gthr.gthr_nm}' 참석을 취소했어요`,
            notiCont: reasonCheck.value ? `사유: ${reasonCheck.value}` : null,
            refId: gthr_id,
            refTypeEnm: "gathering",
          });
        } catch (e) {
          console.error("[gthr_cncl] 알림 발송 실패", e);
        }
      }

      // 홈(/)은 dynamic 렌더(getCurrentMember가 cookies 사용)라 매 요청 새로 조회되므로
      // revalidatePath("/")는 무효화할 캐시가 없어 불필요 — 모임 상세 직접 URL만 무효화한다.
      revalidatePath(`/gatherings/${gthr_id}`);

      // 취소 계열 칭호(다음엔꼭·회전문·월요병·칼퇴실패·구구절절)는 **취소 액션에서만** 붙는다 —
      // 참석 액션에 훅만 달면 영원히 안 붙는다(취소는 다른 액션이다, 설계 §7.2).
      //
      // `after()`가 아니라 await + catch인 이유: `after`는 요청 스코프를 요구해 서버 액션을
      // 직접 부르는 테스트에서 던진다. `save-race-record.ts`도 같은 이유로 이 형태다.
      // catch가 삼키므로 칭호 부여 실패가 이미 끝난 취소를 롤백시키지 않는다.
      await evaluateAndGrantTitles({
        trigger: "gathering_attend",
        teamId,
        teamMemId: member.team_mem_id,
      }).catch((e) => console.error("[title-engine] gathering_attend(취소) 평가 실패", e));

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

    // 신청 순간에 확정되는 것만 여기서 본다 — 실질적으로 `막차`(정확히 정원 번째) 하나다.
    // 참석 계열(미라클·3연벙 등)은 여기 없다: 아직 열리지도 않은 모임을 **신청만 해도**
    // 붙어 버리고, 엔진이 비회수라 취소해도 안 없어진다. 그건 일 배치가 3일 유예를 두고 센다.
    await evaluateAndGrantTitles({
      trigger: "gathering_attend",
      teamId,
      teamMemId: member.team_mem_id,
    }).catch((e) => console.error("[title-engine] gathering_attend(참석) 평가 실패", e));

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
