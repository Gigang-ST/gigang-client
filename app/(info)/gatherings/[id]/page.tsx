import { notFound } from "next/navigation";

import { dayjs } from "@/lib/dayjs";
import { deriveCanceledAttendees } from "@/lib/gathering/derive-canceled-attendees";
import { evaluateJoinConditions, NO_JOIN_CONDITION } from "@/lib/gathering/join-condition";
import { isPastLockedFor } from "@/lib/past-event";
import { getGatheringAttendanceHistory } from "@/lib/queries/gathering-cancel-history";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { gthrTypeLabels } from "@/lib/validations/gathering";

import { getMentionMembers } from "@/app/actions/comment/get-mention-members";

import { CommentSection } from "@/components/comment/comment-section";
import { Avatar } from "@/components/common/avatar";
import { H2, Caption, Micro, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";

import { GatheringJoinConditions } from "@/components/schedule/gathering-join-conditions";

import { GatheringApplyButton, type MyApplicationState } from "./gathering-apply-button";
import { GatheringAttendButton } from "./gathering-attend-button";
import { GatheringCanceledAttendees } from "./gathering-canceled-attendees";
import { GatheringMenuButton } from "./gathering-menu-button";

export default async function GatheringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, supabase } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  const [{ data: gthr }, membersForComment] = await Promise.all([
    supabase
      .from("gthr_mst")
      .select(
        "gthr_id, gthr_nm, gthr_type_enm, sprt_cd, stt_at, end_at, loc_txt, desc_txt, max_prt_cnt, crt_by, team_id, aprv_req_yn, req_attd_cnt, req_attd_months",
      )
      .eq("gthr_id", id)
      .eq("del_yn", false)
      .single(),
    member ? getMentionMembers() : Promise.resolve([]),
  ]);

  if (!gthr || gthr.team_id !== teamId) notFound();

  const admin = createUntypedAdminClient();
  const [{ data: attendees }, myAttd, { data: comments }, cancelHist] = await Promise.all([
    // 참석자 목록: RLS 없이 공개 노출 (팀 멤버 확인은 gthr_mst SELECT RLS가 보장)
    admin
      .from("gthr_attd_rel")
      .select("mem_id, mem_mst(mem_id, mem_nm, avatar_url)")
      .eq("gthr_id", id),
    member
      ? supabase
          .from("gthr_attd_rel")
          .select("attd_id")
          .eq("gthr_id", id)
          .eq("mem_id", member.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // cmnt_mst는 RLS 있는 supabase 클라이언트 사용 — del_yn=true 댓글 RLS가 필터
    supabase
      .from("cmnt_mst")
      .select("cmnt_id, prnt_id, mem_id, cont_txt, edit_yn, del_yn, crt_at, upd_at, mem_mst(mem_nm, avatar_url)")
      .eq("entity_type", "gathering")
      .eq("entity_id", id)
      .order("crt_at", { ascending: true }),
    // 취소 이력: gthr_attd_hist RLS가 팀 멤버 SELECT를 허용 — RLS 클라이언트(supabase) 재사용
    getGatheringAttendanceHistory(supabase, id),
  ]);

  const isAttending = !!myAttd?.data;
  // 취소자 = rel에 없고(재참석 시 rel 재존재로 자동 제외) hist상 마지막 이벤트가 cancel인 멤버.
  // 참석자 수·정원 카운트(attendees.length)에는 포함되지 않는다.
  const canceledAttendees = deriveCanceledAttendees(
    cancelHist,
    new Set((attendees ?? []).map((a) => a.mem_id)),
  ).map((h) => {
    const mem = Array.isArray(h.mem_mst) ? h.mem_mst[0] : h.mem_mst;
    return {
      mem_id: h.mem_id,
      mem_nm: mem?.mem_nm ?? "",
      avatar_url: mem?.avatar_url ?? null,
      evt_at: h.evt_at,
      reason_txt: h.reason_txt,
    };
  });
  const isAuthor = member?.id === gthr.crt_by;
  // 지난 모임(KST 날짜 기준)은 수정·삭제·참석 변경 불가 — 관리자만 예외 (서버 액션에서도 동일 검증)
  const isPastLocked = isPastLockedFor(member?.admin, gthr.stt_at, gthr.end_at);

  // ── 참여조건 · 승인제 ──
  // 조건은 **로그인한 사람 기준**으로만 평가한다(비로그인은 보여줄 "현재 N회"가 없다).
  const conditions = member
    ? await evaluateJoinConditions(admin, { spec: gthr, memId: member.id, teamId })
    : NO_JOIN_CONDITION;

  // 내 신청 상태 — 승인제 모임에서만. 대기·반려는 RLS 로도 본인·개설자·운영진만 볼 수
  // 있지만, 여기서는 admin 클라이언트로 읽으므로 **본인 것으로 코드가 다시 좁힌다**
  // (RLS 우회 경로는 스코프를 코드가 강제한다 — KNOWLEDGE.md).
  //
  // 신청 "관리"(대기 명단·승인·반려)는 이 페이지에 두지 않는다 — 모임 상세 다이얼로그가
  // 맡는다. 알림 딥링크도 달력을 열므로, 승인만 여기 두면 운영진이 도달하지 못한다.
  const { data: myAply } = member && gthr.aprv_req_yn
    ? await admin
        .from("gthr_aply_rel")
        .select("aply_st_cd, rvw_memo_txt")
        .eq("gthr_id", id)
        .eq("mem_id", member.id)
        .maybeSingle()
    : { data: null };

  const myApplicationState = (myAply?.aply_st_cd ?? "none") as MyApplicationState;

  const stt = dayjs(gthr.stt_at).tz("Asia/Seoul");
  const end = gthr.end_at ? dayjs(gthr.end_at).tz("Asia/Seoul") : null;
  const dateStr = stt.format("YYYY년 M월 D일 (ddd)");
  const timeStr = end
    ? `${stt.format("HH:mm")} ~ ${end.format("HH:mm")}`
    : stt.format("HH:mm");

  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      {/* (info) 레이아웃 BackHeader 위에 title + 메뉴를 absolute로 오버레이 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-12 items-center px-4">
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-foreground pointer-events-auto">
          {gthr.gthr_nm}
        </h1>
        {(isAuthor || member?.admin) && !isPastLocked && (
          <div className="absolute right-4 pointer-events-auto">
            <GatheringMenuButton
              gthrId={id}
              isAuthor={isAuthor}
              isAdmin={member?.admin ?? false}
              gthrData={{
                gthr_nm: gthr.gthr_nm,
                gthr_type_enm: gthr.gthr_type_enm,
                sprt_cd: gthr.sprt_cd ?? null,
                stt_at: gthr.stt_at,
                end_at: gthr.end_at ?? null,
                loc_txt: gthr.loc_txt ?? null,
                desc_txt: gthr.desc_txt ?? null,
                max_prt_cnt: gthr.max_prt_cnt ?? null,
                aprv_req_yn: gthr.aprv_req_yn ?? false,
                req_attd_cnt: gthr.req_attd_cnt ?? null,
                req_attd_months: gthr.req_attd_months ?? null,
              }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5 px-6 py-5">
        {/* 모임 정보 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {gthrTypeLabels[gthr.gthr_type_enm as keyof typeof gthrTypeLabels] ?? gthr.gthr_type_enm}
            </Badge>
          </div>

          <H2>{gthr.gthr_nm}</H2>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Caption className="text-muted-foreground w-4">📅</Caption>
              <Caption>{dateStr}</Caption>
            </div>
            <div className="flex items-center gap-2">
              <Caption className="text-muted-foreground w-4">⏰</Caption>
              <Caption>{timeStr}</Caption>
            </div>
            {gthr.loc_txt && (
              <div className="flex items-center gap-2">
                <Caption className="text-muted-foreground w-4">📍</Caption>
                <Caption>{gthr.loc_txt}</Caption>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Caption className="text-muted-foreground w-4">👥</Caption>
              <Caption>
                참석 {attendees?.length ?? 0}명
                {gthr.max_prt_cnt != null && ` / 최대 ${gthr.max_prt_cnt}명`}
              </Caption>
            </div>
          </div>

          {gthr.desc_txt && (
            <div className="rounded-xl bg-secondary/50 px-4 py-3">
              <Caption className="whitespace-pre-wrap text-foreground">{gthr.desc_txt}</Caption>
            </div>
          )}
        </div>

        {/* 참여 조건 — 로그인한 사람에게만(비로그인은 "현재 N회"를 낼 수 없다) */}
        <GatheringJoinConditions conditions={conditions.conditions} />

        {/* 참가 버튼 — 승인제면 신청 흐름, 아니면 기존 원탭 토글 */}
        {member &&
          (gthr.aprv_req_yn ? (
            <GatheringApplyButton
              gthrId={id}
              state={myApplicationState}
              rejectReason={myAply?.rvw_memo_txt ?? null}
              conditionsOk={conditions.ok}
              full={gthr.max_prt_cnt != null && (attendees?.length ?? 0) >= gthr.max_prt_cnt}
              sttAt={gthr.stt_at}
              pastLocked={isPastLocked}
            />
          ) : (
            <GatheringAttendButton
              gthrId={id}
              initialAttending={isAttending}
              maxPrtCnt={gthr.max_prt_cnt ?? null}
              currentAttdCount={attendees?.length ?? 0}
              sttAt={gthr.stt_at}
              pastLocked={isPastLocked}
              conditionsOk={conditions.ok}
            />
          ))}

        {/* 참석자 목록 */}
        {(attendees?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-3">
            <SectionLabel>참석자</SectionLabel>
            <div className="flex flex-wrap gap-3">
              {(attendees ?? []).map((a) => {
                const mem = Array.isArray(a.mem_mst) ? a.mem_mst[0] : a.mem_mst;
                return (
                  <div key={a.mem_id} className="flex flex-col items-center gap-1">
                    <Avatar src={mem?.avatar_url} seed={a.mem_id} alt={mem?.mem_nm ?? ""} size="sm" />
                    <Micro className="text-muted-foreground">{mem?.mem_nm ?? ""}</Micro>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 취소자 목록 */}
        <GatheringCanceledAttendees attendees={canceledAttendees} />

        {/* 댓글 */}
        <div className="flex flex-col gap-3 pb-20">
          <SectionLabel>댓글</SectionLabel>
          <CommentSection
            entityType="gathering"
            entityId={id}
            teamId={teamId}
            currentMemberId={member?.id}
            currentMemberName={member?.full_name}
            currentMemberAvatarUrl={member?.avatar_url}
            isAdmin={member?.admin ?? false}
            members={membersForComment}
            initialComments={(comments ?? []).map((c) => {
              const m = Array.isArray(c.mem_mst) ? c.mem_mst[0] : c.mem_mst;
              return {
                cmnt_id: c.cmnt_id,
                prnt_id: c.prnt_id ?? null,
                mem_id: c.mem_id,
                cont_txt: c.cont_txt,
                edit_yn: c.edit_yn,
                del_yn: c.del_yn,
                crt_at: c.crt_at,
                upd_at: c.upd_at,
                mem_nm: m?.mem_nm ?? null,
                avatar_url: m?.avatar_url ?? null,
              };
            })}
            loginReturnPath={`/gatherings/${id}`}
          />
        </div>
      </div>
    </div>
  );
}
