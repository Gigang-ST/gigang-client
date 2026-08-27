"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";

import { dayjs } from "@/lib/dayjs";
import { withActive, withMember } from "@/lib/actions/auth";
import { isPastLockedFor, PAST_EVENT_ERROR } from "@/lib/past-event";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { backfillApprovals, countPendingApplications } from "@/lib/gathering/application";
import {
  createGthrSchema,
  updateGthrSchema,
  END_BEFORE_START_ERROR,
  REQ_ATTD_PAIR_ERROR,
} from "@/lib/validations/gathering";

function toUtcIso(localDt: string | null | undefined): string | null {
  if (!localDt) return null;
  return dayjs.tz(localDt, "Asia/Seoul").toISOString();
}

export async function createGathering(input: {
  gthr_nm: string;
  gthr_type_enm: string;
  sprt_cd?: string | null;
  stt_at: string;
  end_at?: string | null;
  loc_txt?: string | null;
  desc_txt?: string | null;
  max_prt_cnt?: number | null;
  aprv_req_yn?: boolean;
  req_attd_cnt?: number | null;
  req_attd_months?: number | null;
}) {
  // 모임 개설은 active 회원만 — 비활성/탈퇴는 클라이언트 게이트가 안내, 서버가 최종 방어.
  return withActive(async ({ member, supabase }) => {
    const { teamId } = await getRequestTeamContext();
    const parsed = createGthrSchema.parse({ ...input, team_id: teamId });

    const { data, error } = await supabase
      .from("gthr_mst")
      .insert({
        team_id: parsed.team_id,
        gthr_nm: parsed.gthr_nm,
        gthr_type_enm: parsed.gthr_type_enm,
        sprt_cd: parsed.sprt_cd ?? null,
        stt_at: toUtcIso(parsed.stt_at)!,
        end_at: toUtcIso(parsed.end_at),
        loc_txt: parsed.loc_txt ?? null,
        desc_txt: parsed.desc_txt ?? null,
        max_prt_cnt: parsed.max_prt_cnt ?? null,
        aprv_req_yn: parsed.aprv_req_yn ?? false,
        req_attd_cnt: parsed.req_attd_cnt ?? null,
        req_attd_months: parsed.req_attd_months ?? null,
        crt_by: member.id,
        del_yn: false,
      })
      .select("gthr_id, short_id")
      .single();

    if (error || !data) throw new Error("모임 개설에 실패했습니다.");

    const gthrId = data.gthr_id;
    const authorId = member.id;
    const gthrNm = parsed.gthr_nm;
    const gthrType = parsed.gthr_type_enm;
    const notiTypeMap: Record<string, string> = {
      general: "gthr_new", regular: "gthr_new", event: "gthr_new",
    };

    // 작성자 자동 참석 + 알림 발송을 응답 후 백그라운드로 — 등록 응답을 1 RTT 빠르게.
    // 상세 화면은 작성자를 이미 "참석" 상태로 그리므로(openGatheringDetailInstant) 체감 동일.
    after(async () => {
      try {
        const admin = createUntypedAdminClient();

        // 자동 참석 등록 (응답 경로에서 분리). after는 요청 컨텍스트 종료 후라 admin 클라이언트 사용.
        const { error: attdError } = await admin.from("gthr_attd_rel").insert({ gthr_id: gthrId, mem_id: authorId });
        if (attdError) console.error("[gthr_new] 자동 참석 등록 실패", attdError);

        // 승인제로 열었다면 방금 넣은 개설자 참석에 대응하는 신청 행(approved)도 만든다.
        // 안 하면 **모임을 만든 사람 자신이** 정원엔 잡히는데 신청 관리 목록엔 안 보인다.
        if (parsed.aprv_req_yn) {
          await backfillApprovals(admin, { gthrId, teamId, actorMemId: authorId });
        }

        const { data: members } = await admin
          .from("team_mem_rel")
          .select("mem_id")
          .eq("team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false)
          .neq("mem_id", authorId);

        if (!members?.length) return;

        const notiType = notiTypeMap[gthrType] ?? "gthr_new";
        const dateStr = dayjs(toUtcIso(parsed.stt_at)!).tz("Asia/Seoul").format("M월 D일");

        // 인앱+푸시 한 몸. pref 수신거부 필터는 관문(insertNotiMany)이 처리.
        await insertNotiMany({
          teamId,
          memIds: members.map((m) => m.mem_id),
          notiTypeEnm: notiType,
          notiNm: `${dateStr} 새 모임이 등록됐습니다.`,
          notiCont: `[모임] ${gthrNm}`,
          refId: gthrId,
          refTypeEnm: "gathering",
        });
      } catch (e) {
        console.error("[gthr_new] 알림 발송 실패", e);
      }
    });

    // 홈 캘린더 캐시(1시간 TTL)를 **여기서** 턴다.
    // 예전엔 DB 트리거 웹훅(app/api/revalidate)에만 맡겼는데 그건 둘 다 샌다:
    //  ① 웹훅은 배포 URL로 쏘므로 **로컬 개발에선 아예 안 닿아** 만든 모임이 1시간 동안 안 보인다
    //  ② 웹훅이 쓰는 `revalidateTag(tag, "max")`는 stale-while-revalidate라 프로드에서도
    //     **바로 다음 읽기가 낡은 값**이다(KNOWLEDGE.md "저장했는데 안 보임").
    // 서버 액션 전용 `updateTag`는 즉시 만료 + read-your-own-writes 라 이 자리에 맞다.
    updateTag(HOME_CALENDAR_CACHE_TAG);
    return { gthr_id: gthrId, short_id: data.short_id };
  });
}

export async function updateGathering(input: {
  gthr_id: string;
  gthr_nm?: string;
  gthr_type_enm?: string;
  stt_at?: string;
  end_at?: string | null;
  loc_txt?: string | null;
  desc_txt?: string | null;
  max_prt_cnt?: number | null;
  aprv_req_yn?: boolean;
  req_attd_cnt?: number | null;
  req_attd_months?: number | null;
}) {
  return withMember(async ({ member, supabase }) => {
    const parsed = updateGthrSchema.parse(input);
    const { gthr_id, stt_at, end_at, ...rest } = parsed;

    // 지난 모임(KST 날짜 기준) 수정 차단 — 관리자만 예외. 알림용 기존 모임명도 같이 조회.
    const { data: existing } = await supabase
      .from("gthr_mst")
      .select("gthr_nm, stt_at, end_at, crt_by, aprv_req_yn, req_attd_cnt, req_attd_months")
      .eq("gthr_id", gthr_id)
      .single();
    if (!existing) throw new Error("모임을 찾을 수 없습니다.");

    // 작성자/관리자만 수정 가능 — RLS에만 의존하면 무권한 update가 0행 no-op으로
    // 조용히 "성공" 처리되고 변경 알림까지 발송되므로 코드에서 명시적으로 차단한다.
    if (existing.crt_by !== member.id && !member.admin) {
      throw new Error("수정 권한이 없습니다.");
    }
    if (isPastLockedFor(member.admin, existing.stt_at, existing.end_at)) {
      throw new Error(PAST_EVENT_ERROR);
    }

    // 한쪽만 바꾸는 수정은 스키마가 못 잡는다 — `updateGthrSchema`는 `.partial()`이라
    // `end_at`만 올라오면 견줄 `stt_at`이 없다. 기존값과 합쳐 여기서 다시 본다(#495).
    // 입력은 KST 로컬 문자열이고 기존값은 UTC라, 양쪽을 UTC 절대시각으로 맞춘 뒤 비교한다.
    const nextSttAt = stt_at !== undefined ? toUtcIso(stt_at) : existing.stt_at;
    const nextEndAt = end_at !== undefined ? toUtcIso(end_at) : existing.end_at;
    if (nextSttAt && nextEndAt && dayjs(nextEndAt).isBefore(dayjs(nextSttAt))) {
      throw new Error(END_BEFORE_START_ERROR);
    }

    // 참여조건도 같은 이유로 여기서 다시 본다 — `.partial()`이라 한쪽만 올라오면
    // 스키마의 검사가 통과해 버린다(§lib/validations/gathering reqAttdPaired).
    // 기간은 선택(비우면 전체 기간)이고, 횟수 없이 기간만 남는 조합만 막는다.
    const nextReqCnt =
      parsed.req_attd_cnt !== undefined ? parsed.req_attd_cnt : existing.req_attd_cnt;
    const nextReqMonths =
      parsed.req_attd_months !== undefined ? parsed.req_attd_months : existing.req_attd_months;
    if (nextReqMonths != null && nextReqCnt == null) {
      throw new Error(REQ_ATTD_PAIR_ERROR);
    }

    // 승인제를 **끄는** 수정은 대기 건이 0일 때만 허용한다(설계 §9-g).
    // 자동 승인은 정원을 넘길 수 있고, 그냥 두면 신청자가 영원히 대기에 갇힌다 —
    // 승인제가 꺼진 모임엔 신청 관리 화면 자체가 안 뜨기 때문이다.
    const turningApprovalOff =
      parsed.aprv_req_yn === false && existing.aprv_req_yn === true;
    if (turningApprovalOff) {
      const pending = await countPendingApplications(createUntypedAdminClient(), gthr_id);
      if (pending !== 0) {
        throw new Error(
          pending > 0
            ? `아직 처리하지 않은 참가 신청이 ${pending}건 있어요. 승인 또는 반려한 뒤에 해제할 수 있어요.`
            : "신청 현황을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      }
    }

    // 승인제를 **켜는** 수정이면 기존 참석자를 확정 신청으로 먼저 채운다.
    // 순서가 중요하다 — 플래그를 먼저 켜고 백필이 실패하면, 승인제 모임인데 기존
    // 참석자가 전원 신청 관리에 안 보이는 유령이 된 채로 "저장됐어요"가 뜬다.
    // 먼저 맞춰 두면 실패했을 때 아무것도 안 바꾼 상태로 되돌아간다(플래그가 아직 꺼져 있음).
    if (parsed.aprv_req_yn === true && existing.aprv_req_yn !== true) {
      const { teamId: tid } = await getRequestTeamContext();
      const filled = await backfillApprovals(createUntypedAdminClient(), {
        gthrId: gthr_id,
        teamId: tid,
        actorMemId: member.id,
      });
      if (filled === null) {
        throw new Error("기존 참석자를 정리하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    }

    const { error } = await supabase
      .from("gthr_mst")
      .update({
        ...rest,
        ...(stt_at !== undefined && { stt_at: toUtcIso(stt_at)! }),
        ...(end_at !== undefined && { end_at: toUtcIso(end_at) }),
        upd_at: dayjs().toISOString(),
      })
      .eq("gthr_id", gthr_id);

    if (error) throw new Error("모임 수정에 실패했습니다.");

    updateTag(HOME_CALENDAR_CACHE_TAG);

    const { teamId } = await getRequestTeamContext();


    // gthr_nm이 생략됐을 때 빈 문자열로 알림이 발송되지 않도록 기존 모임명 사용
    const gthrNm = parsed.gthr_nm || (existing.gthr_nm ?? "");

    after(async () => {
      try {
        const admin = createUntypedAdminClient();

        const { data: attendees } = await admin
          .from("gthr_attd_rel")
          .select("mem_id")
          .eq("gthr_id", gthr_id)
          .neq("mem_id", member.id);

        if (!attendees?.length) return;

        // 인앱+푸시 한 몸. pref 수신거부 필터는 관문(insertNotiMany)이 처리.
        await insertNotiMany({
          teamId,
          memIds: attendees.map((a) => a.mem_id),
          notiTypeEnm: "gthr_upd",
          notiNm: `'${gthrNm}' 모임 정보가 변경됐습니다.`,
          notiCont: `[모임] ${gthrNm}`,
          refId: gthr_id,
          refTypeEnm: "gathering",
        });
      } catch (e) {
        console.error("[gthr_upd] 알림 발송 실패", e);
      }
    });

    // 홈은 클라이언트 재조회가 갱신 담당 — 직접 URL 방문 대비 모임 상세만 무효화
    revalidatePath(`/gatherings/${input.gthr_id}`);
    updateTag(HOME_CALENDAR_CACHE_TAG);
  });
}

export async function deleteGathering(gthr_id: string) {
  return withMember(async ({ member, supabase }) => {
    const { data: gthr } = await supabase
      .from("gthr_mst")
      .select("crt_by, team_id, gthr_nm, stt_at, end_at")
      .eq("gthr_id", gthr_id)
      .single();
    if (!gthr) throw new Error("모임을 찾을 수 없습니다.");

    const isAuthor = gthr.crt_by === member.id;
    if (!isAuthor && !member.admin) throw new Error("삭제 권한이 없습니다.");

    // 지난 모임(KST 날짜 기준) 삭제 차단 — 관리자만 예외
    if (isPastLockedFor(member.admin, gthr.stt_at, gthr.end_at)) {
      throw new Error(PAST_EVENT_ERROR);
    }

    const admin = createUntypedAdminClient();
    const { error } = await admin
      .from("gthr_mst")
      .update({ del_yn: true, upd_at: dayjs().toISOString() })
      .eq("gthr_id", gthr_id);

    if (error) throw new Error("모임 삭제에 실패했습니다.");

    after(async () => {
      try {
        const { data: attendees } = await admin
          .from("gthr_attd_rel")
          .select("mem_id")
          .eq("gthr_id", gthr_id)
          .neq("mem_id", member.id);

        if (!attendees?.length) return;

        // 인앱+푸시 한 몸. gthr_del은 gthr_upd와 동일한 설정 항목으로 수신거부를 판단(prefTypeEnm).
        await insertNotiMany({
          teamId: gthr.team_id,
          memIds: attendees.map((a) => a.mem_id),
          notiTypeEnm: "gthr_del",
          prefTypeEnm: "gthr_upd",
          notiNm: `'${gthr.gthr_nm}' 모임이 취소됐습니다.`,
          notiCont: `[모임] ${gthr.gthr_nm}`,
          refId: gthr_id,
          refTypeEnm: "gathering",
        });
      } catch (e) {
        console.error("[gthr_del] 알림 발송 실패", e);
      }
    });

  });
}
