"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";

import { withActive } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { APPROVAL_GATHERING_MESSAGE } from "@/lib/gathering/application";
import {
  CANCEL_REASON_REQUIRED_MESSAGE,
  isCancelReasonRequired,
  isWaitlistOpenToAll,
} from "@/lib/gathering/cancel-imminent";
import { parseCancelResult } from "@/lib/gathering/cancel-result";
import { runPromotionFollowups } from "@/lib/gathering/promotion-followup";
import { validateCancelReason } from "@/lib/gathering/cancel-reason";
import { evaluateJoinConditions, joinConditionErrorMessage } from "@/lib/gathering/join-condition";
import { joinGatheringWithCapCheck } from "@/lib/gathering/join-gathering";
import { waitRankOf } from "@/lib/gathering/waitlist";
import { insertNoti } from "@/lib/notifications/insert-noti";
import { isPastLockedFor } from "@/lib/past-event";
import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

/**
 * 참석 토글 결과.
 *
 * 대기열이 생기며 boolean 으로는 표현할 수 없게 됐다 — 참석/대기/없음 셋이다
 * (설계 docs/superpowers/specs/2026-09-10-모임-대기열-design.md §9).
 */
export type ToggleAttendanceResult = {
  state: "attending" | "waiting" | "none";
  /** 대기 순번(1-based). state === "waiting" 일 때만 실린다. */
  waitRank?: number;
  /** 이 모임의 총 대기 인원. */
  waitCount?: number;
  /** 참석 확정 시 그 달 본인 총참석 횟수(토스트용). */
  monthlyAttendCnt?: number;
};

/**
 * 모임 참석 토글 — 참석 ↔ 대기 ↔ 없음을 한 번 누를 때마다 순환시킨다.
 *
 * - 미참석 + 자리 있음 → 참석(`attending`)
 * - 미참석 + 만석      → **대기 등록**(`waiting`). 예전엔 "인원이 마감됐습니다"로 거절했다
 * - 대기 중            → 대기 취소(`none`)
 * - 참석 중            → 참석 취소(`none`) + 자리가 났으니 대기 1번 자동 승급
 *
 * 참석 등록 시 `monthlyAttendCnt`(그 모임 stt_at 월 기준 본인 총참석 횟수)를 함께 반환해,
 * 클라이언트가 "이번 달 N회 참석" 토스트를 띄울 수 있게 한다.
 *
 * 취소 시 `reason`(선택 또는 필수)을 넘기면 취소 이력(gthr_attd_hist)에 사유로 저장된다.
 * 모임 시작 GATHERING_CANCEL_IMMINENT_HOURS 시간 전부터의 취소는 사유가 필수다(클라이언트 모달
 * 뿐 아니라 여기서도 재검증 — 클라이언트를 신뢰하지 않음). 등록·대기 토글 시 reason 은 무시.
 */
export async function toggleGatheringAttendance(
  gthr_id: string,
  reason?: string,
  /**
   * `"join"` — 선착순 구간(시작 2시간 전~)에 **대기 중인 사람이 빈 자리로 참석**하려는 경우에만.
   * 생략하면 기존 토글이다(대기 중이면 대기 취소). 선착순 구간 전에 넘기면 거절한다.
   */
  intent?: "join",
): Promise<ToggleAttendanceResult> {
  return withActive(async ({ member, supabase }) => {
    // 모임 검증용 조회와 내 참석 여부 조회는 독립적 — 병렬 1 RTT로 (직렬 2 RTT 방지)
    const admin = createUntypedAdminClient();
    const { teamId } = await getRequestTeamContext();
    const [{ data: gthr }, { data: existing }, { data: myWait }] = await Promise.all([
      admin
        .from("gthr_mst")
        .select(
          "max_prt_cnt, stt_at, end_at, gthr_nm, crt_by, aprv_req_yn, req_attd_cnt, req_attd_months",
        )
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
      // 내 대기 행. 참석 행이 없을 때만 의미가 있지만, 세 상태 판정을 한 왕복에 끝내려고
      // 함께 가져온다(직렬로 나누면 대기 취소 때만 RTT 가 하나 늘어난다).
      // 신규 테이블이라 아직 DB 타입 미생성 → untyped 관리자 클라이언트로 조회
      // (gen types 후 supabase 로 교체 예정). mem_id 를 세션 값으로 못박아 읽으므로
      // RLS 를 우회해도 남의 행이 나올 수 없다.
      admin
        .from("gthr_wait_rel")
        .select("wait_id")
        .eq("gthr_id", gthr_id)
        .eq("mem_id", member.id)
        .eq("wait_st_cd", "waiting")
        .maybeSingle(),
    ]);

    if (!gthr) throw new Error("모임을 찾을 수 없습니다.");

    // 지난 모임(KST 날짜 기준)은 참석/참석해제 불가 — 관리자만 예외
    if (isPastLockedFor(member.admin, gthr.stt_at, gthr.end_at)) {
      throw new Error("지난 모임은 참석 변경이 불가합니다.");
    }

    // 승인제 모임은 이 액션을 아예 타지 않는다 — 등록도 취소도.
    //
    // 등록을 막는 건 승인제를 통째로 우회하기 때문이고(버튼을 감추는 건 안내일 뿐, gthr_id만
    // 알면 이 액션은 직접 호출된다), **취소도 같이 막는 게 핵심**이다: 여기서 취소하면
    // gthr_attd_rel 행만 지워지고 gthr_aply_rel 은 approved 로 남아, 신청 관리 목록엔
    // 확정으로 보이는데 실제 참석자엔 없는 유령이 생긴다. 승인제 모임의 취소 경로는
    // cancelMyApplicationAction 하나뿐이다(RPC가 두 테이블을 한 트랜잭션으로 정리한다).
    if (gthr.aprv_req_yn) {
      throw new Error(APPROVAL_GATHERING_MESSAGE);
    }

    // 대기 취소 — 참석 취소와 **다른 일**이다. 자리를 갖고 있던 게 아니므로
    // 임박 취소 사유도, 모임장 알림도, 취소 이력(gthr_attd_hist)도 없다.
    // 그 이력 테이블은 "참석했다가 빠진 사람"을 위한 것이고, 모임 상세의 "취소한 사람"
    // 표시에 대기자가 섞이면 뜻이 흐려진다. 다시 걸면 맨 뒤로 갈 뿐이라 되돌리기도 쉽다.
    // 선착순 구간(시작 2시간 전~)에 대기 중인 사람이 빈 자리로 **직접 참석**하려는 경우.
    // 토글만으로는 "대기 취소"와 구분이 안 돼 의도(intent)를 받는다(PR #532 리뷰).
    //
    // 새 RPC 는 필요 없다 — 아래 참석 등록의 join_gthr_or_wait 가 이미 모임 행 잠금 → 빈자리 확인
    // → 참석 INSERT → 대기 행 promoted 종료를 한 트랜잭션으로 한다. 그 사이 자리가 찼으면
    // 대기 순번을 그대로 유지한 채 waiting 을 돌려준다.
    const joinFromWait = !existing && !!myWait && intent === "join";
    if (joinFromWait && !isWaitlistOpenToAll(gthr.stt_at)) {
      // 선착순 구간 전에는 대기자가 직접 들어오면 앞 순번을 제치게 된다 — 자동 승급만 허용한다.
      throw new Error("아직은 대기 순번대로 자동 참석돼요.");
    }

    if (!existing && myWait && !joinFromWait) {
      const { error: waitCancelErr } = await admin
        .from("gthr_wait_rel")
        .update({ wait_st_cd: "canceled", upd_at: dayjs().toISOString() })
        .eq("gthr_id", gthr_id)
        .eq("mem_id", member.id)
        .eq("wait_st_cd", "waiting");
      if (waitCancelErr) throw new Error("대기 취소에 실패했습니다.");

      revalidatePath(`/gatherings/${gthr_id}`);
      updateTag(HOME_CALENDAR_CACHE_TAG);
      return { state: "none" };
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

      // 취소 = gthr_attd_rel DELETE + gthr_attd_hist(cancel) INSERT + **대기열 승급**을
      // 원자적으로. 승급을 별도 RPC로 나눠 부르면 ① 두 명이 동시에 취소할 때 둘 다 같은
      // 대기 1번을 올리려 하고 ② 두 호출 사이에서 죽으면 자리가 빈 채로 영영 남는다
      // (다음 취소가 나기 전까지 아무도 안 올라간다). 설계 §3-1.
      //
      // cancel_gthr_attendance RPC 는 service_role 전용(authenticated·anon EXECUTE 회수)이라
      // 본인 인가가 끝난 admin 클라이언트로 호출한다. actor 는 본인(self).
      const { data: cancelRaw, error: cancelError } = await admin.rpc("cancel_gthr_attendance", {
        p_gthr_id: gthr_id,
        p_mem_id: member.id,
        p_actor_cd: "self",
        p_actor_mem_id: member.id,
        p_reason: reasonCheck.value,
      });
      if (cancelError) throw new Error("참석 취소에 실패했습니다.");
      // RPC 가 **트랜잭션 안에서** 계산한 승급자와 빈 자리 알림 여부를 돌려준다. 정원이 여전히
      // 차 있으면(운영진이 우겨넣어 초과 상태면) 승급자도 알림도 없다 — 그게 의도다(설계 §5-1).
      const cancelResult = parseCancelResult(cancelRaw);
      const promoted = cancelResult.promoted;

      // 홈(/)은 dynamic 렌더(getCurrentMember가 cookies 사용)라 매 요청 새로 조회되므로
      // revalidatePath("/")는 무효화할 캐시가 없어 불필요 — 모임 상세 직접 URL만 무효화한다.
      revalidatePath(`/gatherings/${gthr_id}`);
      // 참석자 수는 달력·리스트 칩에 그대로 찍히므로 홈 캘린더 캐시도 즉시 턴다.
      updateTag(HOME_CALENDAR_CACHE_TAG);

      // 뒷일(모임장 알림 · 칭호 평가)은 **응답 밖에서** 돈다.
      //
      // 취소는 위 RPC에서 이미 끝났고 이 둘은 성공 여부를 바꾸지 않는데, `await`로 두면
      // 모임장 푸시(웹푸시 외부 HTTP)와 칭호 조회 왕복이 그대로 **취소 모달이 닫히는 시간**이
      // 된다 — 클라이언트가 액션이 끝나야 모달을 닫기 때문이다(gathering-attend-button.tsx).
      // 참석 등록과 달리 취소는 낙관적 업데이트가 모달에 가려 체감이 그대로 드러난다.
      //
      // 둘은 서로 독립이라 같이 출발시킨다. 각자 catch를 물고 있어 한쪽 실패가 다른 쪽을
      // 막지 않고, 이미 끝난 취소를 되돌리지도 않는다.
      after(async () => {
        await Promise.all([
          // 모임장(개설자)에게 취소 알림 — 본인이 자기 모임을 취소한 경우엔 보내지 않는다.
          // 수신거부는 gthr_cncl 자체 설정으로 판단한다 — 모임 수정·삭제(gthr_upd)와는 별개
          // 항목으로, 알림 설정 UI의 "내 모임 참석 취소" 토글로 제어한다. prefTypeEnm 미지정 시
          // insertNoti가 notiTypeEnm(gthr_cncl)으로 수신거부를 판단한다.
          gthr.crt_by && gthr.crt_by !== member.id
            ? insertNoti({
                teamId,
                memId: gthr.crt_by,
                notiTypeEnm: "gthr_cncl",
                notiNm: `${member.full_name}님이 '${gthr.gthr_nm}' 참석을 취소했어요`,
                notiCont: reasonCheck.value ? `사유: ${reasonCheck.value}` : null,
                refId: gthr_id,
                refTypeEnm: "gathering",
              }).catch((e) => console.error("[gthr_cncl] 알림 발송 실패", e))
            : Promise.resolve(),

          // 취소 계열 칭호(다음엔꼭·회전문·월요병·칼퇴실패·구구절절)는 **취소 액션에서만**
          // 붙는다 — 참석 액션에 훅만 달면 영원히 안 붙는다(취소는 다른 액션이다, 설계 §7.2).
          // 트리거가 `gathering_attend`와 갈려 있어 여기선 막차(신청 순번)를 평가하지 않는다.
          evaluateAndGrantTitles({
            trigger: "gathering_cancel",
            teamId,
            teamMemId: member.team_mem_id,
          }).catch((e) => console.error("[title-engine] gathering_cancel 평가 실패", e)),

          // 대기열이 움직인 뒷처리(승급 알림 · 빈 자리 알림 · 승급자 칭호)는 세 경로(본인 취소 ·
          // 운영진 제거 · 정원 증가)가 **공유한다** — 경로마다 따로 만들면 한쪽만 빠진다(실제로 칭호
          // 평가가 운영진 제거·정원 증가에 빠져 있었다). 판정값은 RPC 가 트랜잭션 안에서 정한 것을
          // 그대로 넘긴다. 이 함수는 reject 하지 않는다.
          runPromotionFollowups(admin, {
            teamId,
            gthrId: gthr_id,
            gthrNm: gthr.gthr_nm,
            cause: "cancel",
            promoted,
            notifyOpenSeat: cancelResult.notifyOpenSeat,
          }),
        ]);
      });

      return { state: "none" };
    }

    // 참여조건은 **등록에만** 건다(취소는 조건과 무관하다 — 위 취소 분기는 이미 반환됐다).
    // 조건 미달이면 화면에서 버튼이 잠기지만, 그건 안내일 뿐이라 서버가 최종 판정한다.
    // 어떤 조건이 얼마나 모자란지를 메시지에 실어 — 클라이언트가 조건 블록을 다시 조회하지
    // 않고도 그대로 보여줄 수 있게 한다.
    const conditions = await evaluateJoinConditions(admin, { spec: gthr, memId: member.id, teamId });
    if (!conditions.ok) {
      throw new Error(joinConditionErrorMessage(conditions));
    }

    // 정원 재확인 + INSERT(또는 대기 등록)는 온보딩(onboardingCreateMember)과 공유하는
    // 유틸 사용. 그 안에서 join_gthr_or_wait RPC 가 모임 행을 FOR UPDATE 로 잠그고
    // 처리하므로 여기서 정원을 따로 세지 않는다 — 예전의 COUNT→upsert 2단계는
    // 원자적이지 않아 만석 직전 동시 클릭에 정원+1 이 됐다(설계 §4).
    //
    // INSERT 가 RPC(service_role) 안으로 들어가며 "본인만 INSERT" RLS 정책의 보호가
    // 사라지므로, RPC 는 authenticated·anon EXECUTE 를 회수했고 `memId` 에는 세션에서
    // 꺼낸 member.id 만 넘긴다(클라이언트 입력이 이 인자에 닿는 경로를 만들지 않는다).
    const joinResult = await joinGatheringWithCapCheck(admin, {
      gthrId: gthr_id,
      memId: member.id,
      teamId,
      isAdmin: member.admin,
    });

    if (!joinResult.joined && !joinResult.waiting) {
      throw new Error("참석 등록에 실패했습니다.");
    }

    // 홈(/)은 dynamic이라 revalidate 불필요(위 취소 경로 주석 참고). 모임 상세 직접 URL만 무효화.
    revalidatePath(`/gatherings/${gthr_id}`);
    updateTag(HOME_CALENDAR_CACHE_TAG);

    // 만석이라 대기로 들어간 경우 — 순번은 **서버가 정한다.** 클라이언트가 낙관적으로
    // 지어낼 수 없는 값이라 여기서 계산해 돌려준다(설계 §9).
    // 칭호 평가도 하지 않는다: 아직 참석이 아니다.
    if (joinResult.waiting) {
      const { data: waitRows } = await admin
        .from("gthr_wait_rel")
        .select("mem_id, wait_at")
        .eq("gthr_id", gthr_id)
        .eq("wait_st_cd", "waiting");
      const entries = (waitRows ?? []) as { mem_id: string; wait_at: string }[];
      return {
        state: "waiting",
        waitRank: waitRankOf(entries, member.id) ?? undefined,
        waitCount: entries.length,
      };
    }

    // 신청 순간에 확정되는 것만 여기서 본다 — 실질적으로 `막차`(정확히 정원 번째) 하나다.
    // 참석 계열(미라클·3연벙 등)은 여기 없다: 아직 열리지도 않은 모임을 **신청만 해도**
    // 붙어 버리고, 엔진이 비회수라 취소해도 안 없어진다. 그건 일 배치가 3일 유예를 두고 센다.
    //
    // 취소 경로와 같은 이유로 응답 밖에서 돈다 — 판정 대상은 이미 INSERT된 신청 순번이라
    // 응답 직후에 봐도 결과가 같다. 아래 월 참석 횟수 조회는 반환값(토스트)이라 여기 남는다.
    after(() =>
      evaluateAndGrantTitles({
        trigger: "gathering_attend",
        teamId,
        teamMemId: member.team_mem_id,
      }).catch((e) => console.error("[title-engine] gathering_attend(참석) 평가 실패", e)),
    );

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

    return { state: "attending", monthlyAttendCnt };
  });
}
