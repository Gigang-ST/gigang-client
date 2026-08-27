"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Copy, ExternalLink, Lock, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { dayjs, parseEventTime } from "@/lib/dayjs";
import { isPastLockedFor } from "@/lib/past-event";
import { gthrTypeLabels, gthrSprtLabels, type GthrType, type GthrSprtType } from "@/lib/validations/gathering";

import {
  getMyGatheringApplication,
  listGatheringApplications,
  type MyGatheringApplication,
} from "@/app/actions/gathering/manage-application";
import { deleteGathering } from "@/app/actions/gathering/manage-gathering";
import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";
import { GatheringApplyButton } from "@/app/(info)/gatherings/[id]/gathering-apply-button";
import {
  GatheringApplicationsSection,
  type GatheringApplication,
} from "@/components/schedule/gathering-applications-section";
import { GatheringJoinConditions } from "@/components/schedule/gathering-join-conditions";
import { GatheringCancelDialog } from "@/app/(info)/gatherings/[id]/gathering-cancel-dialog";
import {
  GatheringCanceledAttendees,
  type CanceledAttendee,
} from "@/app/(info)/gatherings/[id]/gathering-canceled-attendees";


import type { CmntRow } from "@/components/comment/comment-item";
import { CommentSection } from "@/components/comment/comment-section";
import { renderMentions, type MemberOption } from "@/components/comment/mention-input";
import { Avatar } from "@/components/common/avatar";
import { InactiveGateDialog } from "@/components/common/inactive-gate-dialog";
import { ShareSheet } from "@/components/common/share-sheet";
import {
  ResponsiveDrawer,
  ResponsiveDrawerClose,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption, Micro } from "@/components/common/typography";
import type { CalendarRace } from "@/components/home/mini-calendar";
import { MemberCardDialogDynamic as MemberCardDialog } from "@/components/members/member-card-dialog-dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 내 신청 상태를 못 받아왔을 때의 기본값.
 *
 * 조회 실패(비활성 회원·네트워크)를 `null` 로 두면 로딩과 구분되지 않아 화면이 멈춘다.
 * 조건은 "없음"으로 두어 버튼을 세우되, 실제 허용 여부는 서버 액션이 다시 판정한다.
 */
const UNKNOWN_APPLICATION = {
  state: "none",
  rejectReason: null,
  conditions: { ok: true, conditions: [] },
} as const satisfies MyGatheringApplication;

export type GatheringAttendee = {
  mem_id: string;
  mem_nm: string | null;
  avatar_url: string | null;
};

export interface GatheringDetailDialogProps {
  gathering: (CalendarRace & {
    maxPrtCnt?: number | null;
    /** 승인제·참여조건 — 신청 흐름은 모임 상세 페이지가 맡고 여기선 안내만 한다 */
    aprvReqYn?: boolean | null;
    reqAttdCnt?: number | null;
    reqAttdMonths?: number | null;
    attendees?: GatheringAttendee[];
    canceledAttendees?: CanceledAttendee[];
    sprt_cd?: string | null;
  }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  currentMemberId?: string;
  /** 뷰어가 비활성/탈퇴 — 보기는 열되 참석·댓글 등 쓰기는 안내 게이트로 대체 */
  viewerInactive?: boolean;
  /** 비활성/탈퇴 세부 구분 — InactiveGateDialog 문구 분기용 */
  viewerInactiveKind?: "inactive" | "left";
  currentMemberName?: string | null;
  currentMemberAvatarUrl?: string | null;
  isAdmin?: boolean;
  isAttending?: boolean;
  /** 즉시 오픈 후 참석자/정원을 뒤에서 채우는 중 — 참석자 영역 스켈레톤 + 참석 버튼 잠금 */
  detailLoading?: boolean;
  members: MemberOption[];
  initialComments?: CmntRow[];
  /** 방금 등록한 직후 열린 경우 — 공유 유도 안내를 노출한다 */
  justCreated?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onAttendanceChange?: () => void;
  /** "이 내용으로 새 모임" — 이 모임 내용을 프리필한 등록 폼 열기. 로그인 멤버 누구나 가능 */
  onClone?: () => void;
}

export function GatheringDetailDialog({
  gathering,
  open,
  onOpenChange,
  teamId,
  currentMemberId,
  viewerInactive,
  viewerInactiveKind,
  currentMemberName,
  currentMemberAvatarUrl,
  isAdmin,
  isAttending: initialIsAttending,
  detailLoading,
  members,
  initialComments,
  justCreated,
  onEdit,
  onDelete,
  onAttendanceChange,
  onClone,
}: GatheringDetailDialogProps) {
  const [inactiveGateOpen, setInactiveGateOpen] = useState(false);
  const [attending, setAttending] = useState(initialIsAttending ?? false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [attdCount, setAttdCount] = useState(gathering?.regCount ?? 0);
  const [attendees, setAttendees] = useState(gathering?.attendees ?? []);
  const [canceledAttendees, setCanceledAttendees] = useState<CanceledAttendee[]>(gathering?.canceledAttendees ?? []);
  // 참석 토글 재진입 가드 — 동기 ref로 같은 렌더 내 연타까지 막는다(리렌더 의존 state는 못 막음).
  // 버튼 흐림 없이 재클릭만 무시하므로 UI에 노출할 state는 불필요.
  const togglingRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 참석자 탭 → 프로필 카드. 이 다이얼로그 위에 겹쳐 연다(stacked).
  const [selectedMember, setSelectedMember] = useState<{
    memId: string;
    name: string;
  } | null>(null);
  // 방금 등록한 직후에만 공유 유도 안내 노출. 공유하기를 누르면 숨긴다.
  const [showShareHint, setShowShareHint] = useState(justCreated ?? false);
  // 등록 직후 다이얼로그가 맨 위에서 열려 하단 공유 유도가 안 보이는 문제 → 공유 영역으로 스크롤
  const shareHintRef = useRef<HTMLDivElement>(null);

  // 보는 사람 기준 상태 — "내 신청 상태 + 참여조건 판정". 클라이언트는 조건을 스스로 계산할
  // 수 없어(팀 전체 모임 집계가 필요) 서버에 묻는다. get_gathering_detail RPC 에 실지 않는
  // 이유: 그건 anon 실행이 허용된 SECURITY DEFINER 라 대기·반려가 비로그인에게까지 샌다(설계 §8-9).
  const [myAply, setMyAply] = useState<MyGatheringApplication | null>(null);
  // 신청 관리(개설자·운영진 전용) — 승인하면 그 사람이 참석자가 되므로 명단과 참석자를 같이 갱신한다.
  const [applications, setApplications] = useState<GatheringApplication[] | null>(null);
  const canReview = !!currentMemberId && (isAdmin === true || currentMemberId === gathering?.crt_by);

  // ⚠️ 승인제가 아니어도 **참여조건만 걸린 모임**이 있다. 둘은 독립 옵션이라
  //    `aprvReqYn` 만 보고 조회를 건너뛰면 조건이 화면에 안 뜨고 참석 버튼도 안 잠긴다
  //    (서버는 막으니 눌러야 비로소 알게 된다). 실제로 그렇게 뚫렸다.
  const needsViewerState = !!gathering && (gathering.aprvReqYn === true || gathering.reqAttdCnt != null);
  const loadMyApplication = useCallback(() => {
    const gid = gathering?.id;
    if (!gid || !needsViewerState || !currentMemberId) return;
    void getMyGatheringApplication(gid)
      .then(setMyAply)
      // ⚠️ 실패를 null 로 되돌리면 아래 렌더가 "불러오는 중…"(disabled)에 **영영 갇힌다.**
      //    실제로 비활성 회원이 그랬다 — 이 액션은 withActive 라 그들에겐 항상 던진다.
      //    조건 없는 기본값으로 떨어뜨려 버튼은 서고, 최종 판정은 서버가 한다.
      .catch(() => setMyAply(UNKNOWN_APPLICATION));
    // 신청 명단은 승인제 모임에만 있다(조건만 건 모임엔 신청 개념이 없다).
    if (canReview && gathering?.aprvReqYn) {
      void listGatheringApplications(gid)
        .then(setApplications)
        .catch(() => setApplications(null));
    }
  }, [gathering?.id, gathering?.aprvReqYn, needsViewerState, currentMemberId, canReview]);

  // 열릴 때마다 새로 받는다 — 다른 기기·운영진이 그 사이 승인했을 수 있다.
  useEffect(() => {
    if (!open) return;
    loadMyApplication();
  }, [open, loadMyApplication]);

  // gathering prop이 바뀌거나 justCreated가 바뀌면 로컬 상태 동기화
  // (렌더 중 파생 state 업데이트 — React 공식 패턴: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // gKey만 키로 쓰면 같은 모임을 재오픈할 때(gKey 동일) 힌트가 잔존하므로 justCreated도 키에 포함한다.
  // detailLoading도 키에 포함 — 즉시 오픈 후 참석자/참석여부가 늦게 도착하면(false로 전환) 다시 동기화한다.
  const gKey = gathering?.id;
  const syncKey = `${gKey}:${justCreated ?? false}:${detailLoading ?? false}`;
  const [lastSyncKey, setLastSyncKey] = useState(syncKey);
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    setAttending(initialIsAttending ?? false);
    setAttdCount(gathering?.regCount ?? 0);
    setAttendees(gathering?.attendees ?? []);
    setCanceledAttendees(gathering?.canceledAttendees ?? []);
    setShowShareHint(justCreated ?? false);
    // 다른 모임을 열면 이전 모임의 신청 상태가 잠깐 보이지 않게 지운다.
    setMyAply(null);
    setApplications(null);
  }

  // 참석자 명단이 **밖에서** 바뀌면 다시 받아 그린다.
  //
  // 일반 참석 토글은 낙관적 업데이트로 로컬 상태를 직접 고치니까 즉시 반영되지만,
  // 승인·반려·신청취소는 부모가 상세를 다시 조회해 `gathering` prop 으로 흘려보낸다.
  // 그런데 위 syncKey 는 `모임id:justCreated:detailLoading` 뿐이라 **참석자만 바뀐 갱신은
  // 키가 그대로**여서 통째로 무시됐다 — 승인해도 "참석 N명"과 참석자 목록이 그 자리에서
  // 안 변하고 다시 열어야 보였다.
  //
  // 키를 참석자 mem_id 목록으로 잡는다: 한 명이 빠지고 한 명이 들어오는 교대(정원이 찬
  // 모임에서 흔하다)도 잡히고, 길이만 보면 놓친다. 낙관적 업데이트가 앞서 있는 동안엔
  // prop 이 아직 옛 값이라 키가 안 변하므로 덮어쓰지 않는다.
  const attdKey = `${gKey}:${(gathering?.attendees ?? []).map((a) => a.mem_id).join(",")}`;
  const [lastAttdKey, setLastAttdKey] = useState(attdKey);
  if (attdKey !== lastAttdKey) {
    setLastAttdKey(attdKey);
    const next = gathering?.attendees ?? [];
    setAttendees(next);
    setAttdCount(next.length);
    // 내 참석 여부도 명단에서 다시 읽는다 — 운영진이 대신 승인·취소했을 수 있다.
    if (currentMemberId) setAttending(next.some((a) => a.mem_id === currentMemberId));
    setCanceledAttendees(gathering?.canceledAttendees ?? []);
  }

  // 등록 직후 열렸을 때, 다이얼로그 본문이 길어 하단 공유 유도가 가려지지 않도록 그 영역으로 스크롤.
  useEffect(() => {
    if (!open || !justCreated) return;
    // 다이얼로그/콘텐츠 마운트 후 레이아웃이 잡힌 다음 스크롤
    const id = setTimeout(() => {
      shareHintRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(id);
  }, [open, justCreated, gKey]);

  if (!gathering) return null;

  const isAuthor = currentMemberId === gathering.crt_by;
  const isFull = !attending && gathering.maxPrtCnt != null && attdCount >= gathering.maxPrtCnt;
  // 참여조건 잠금은 **등록에만** 건다 — 이미 참석 중이면 취소는 열어 둔다(조건이 나중에
  // 걸린 모임에서 빠져나올 길이 사라지면 안 된다). 아직 판정을 못 받았으면 잠그지 않는다
  // — 서버가 최종 게이트라 여기서 성급히 막는 것보다 낫다.
  const conditionLocked = !attending && myAply != null && !myAply.conditions.ok;
  // 지난 모임(KST 날짜 기준)은 수정·삭제·참석 변경 불가 — 관리자만 예외 (서버 액션에서도 동일 검증)
  const isPastLocked = isPastLockedFor(isAdmin, gathering.evt_stt_at ?? gathering.start_date, gathering.evt_end_at);

  // evt_stt_at 없으면 start_date(날짜만)로 폴백 — parseEventTime이 KST 자정으로 고정해
  // 기기 타임존에 따라 시각 표시가 어긋나지 않게 한다(isPastLocked·취소 판정과 동일 기준).
  const stt = parseEventTime(gathering.evt_stt_at ?? gathering.start_date).tz("Asia/Seoul");
  const end = gathering.evt_end_at ? parseEventTime(gathering.evt_end_at).tz("Asia/Seoul") : null;
  const dateStr = stt.format("YYYY년 M월 D일 (ddd)");
  const timeStr = end ? `${stt.format("HH:mm")} ~ ${end.format("HH:mm")}` : stt.format("HH:mm");

  const typeLabel = gthrTypeLabels[gathering.post_type as GthrType] ?? gathering.post_type;
  const sprtLabel = gathering.sprt_cd ? (gthrSprtLabels[gathering.sprt_cd as GthrSprtType] ?? gathering.sprt_cd) : null;

  // 공유 텍스트용 — 딥링크는 `/schedule`에 붙인다. `?gthr=`를 읽어 상세를 여는 건
  // MiniCalendar이고 그건 일정 페이지에만 있다(홈은 전광판 — lib/notifications/deep-link.ts).
  const gthrRef = gathering.short_id ?? gathering.id;
  const sharePageUrl = typeof window !== "undefined"
    ? `${window.location.origin}/schedule?gthr=${gthrRef}`
    : `/schedule?gthr=${gthrRef}`;

  // 단톡방 공유 본문 — 정보 나열이 아니라 "같이 뛰어요 + CTA"로 참여를 유도한다.
  // 시간: 오전/오후 + 분 단위(A h:mm). 인원: 2명 이상일 때만(처음 공유는 작성자 1명뿐이라 생략).
  const shareDateTime = end
    ? `${stt.format("M/D (ddd) A h:mm")} ~ ${stt.format("YYYY-MM-DD") === end.format("YYYY-MM-DD") ? end.format("A h:mm") : end.format("M/D (ddd) A h:mm")}`
    : stt.format("M/D (ddd) A h:mm");
  const shareLines = ["🏃‍♂️ 같이 뛰어요!", "", `「${gathering.title}」`, `🗓 ${shareDateTime}`];
  if (gathering.location) shareLines.push(`📍 ${gathering.location}`);
  if (gathering.crt_by_nm) shareLines.push(`🙋 ${gathering.crt_by_nm}`);
  if (attdCount >= 2) {
    shareLines.push(`👥 ${gathering.maxPrtCnt != null ? `${attdCount}/${gathering.maxPrtCnt}명` : `${attdCount}명`}`);
  }
  shareLines.push("", "참여하기 👇", sharePageUrl);
  const gthrShareText = shareLines.join("\n");

  async function handleToggleAttendance() {
    if (!currentMemberId || isFull || togglingRef.current) return;
    // 참석 취소는 사유 확인 모달을 거친다(임박 시 사유 필수) — 참석 등록은 그대로 즉시 처리.
    if (attending) {
      setCancelDialogOpen(true);
      return;
    }
    togglingRef.current = true;
    const prev = attending;
    const prevCanceled = canceledAttendees;
    const myEntry = { mem_id: currentMemberId, mem_nm: currentMemberName ?? null, avatar_url: currentMemberAvatarUrl ?? null };
    setAttending(!prev);
    setAttdCount((c) => (!prev ? c + 1 : c - 1));
    setAttendees((list) => !prev ? [...list, myEntry] : list.filter((a) => a.mem_id !== currentMemberId));
    // 재참석(!prev=참석 등록)이면 취소자 목록에서 본인을 즉시 뺀다 — 안 그러면 같은 모달 안에서
    // 취소→재참석 시 참석·취소 양쪽에 동시에 보인다(재오픈 전까지). 재오픈하면 rel 우선 파생으로 자동 정리.
    if (!prev) setCanceledAttendees((list) => list.filter((c) => c.mem_id !== currentMemberId));
    try {
      const result = await toggleGatheringAttendance(gathering!.id);
      setAttending(result.attending);
      if (result.attending && result.monthlyAttendCnt) {
        toast.success(`이번 달 ${result.monthlyAttendCnt}회 참여!`);
      }
      // 부가 갱신(달력·참석자 재조회)은 참석 처리와 독립 — 여기서 reject돼도 위 성공한 토글을
      // 롤백하면 안 되므로 try 밖에서 삼킨다(catch 흐름 오염·unhandled rejection 방지).
      void Promise.resolve(onAttendanceChange?.()).catch((err) => {
        console.error("[gathering] 참석 변경 후 갱신 실패", err);
      });
    } catch (e) {
      setAttending(prev);
      setAttdCount((c) => (prev ? c + 1 : c - 1));
      setAttendees(gathering!.attendees ?? []);
      setCanceledAttendees(prevCanceled);
      // 서버 거절 사유(지난 모임·인원 마감 등)를 안내 — 무음 롤백이면 버튼 고장으로 오인한다
      toast.error(e instanceof Error ? e.message : "참석 처리에 실패했습니다.");
    } finally {
      togglingRef.current = false;
    }
  }

  // 참석 취소 확정 — 사유 모달에서 호출. 실패 시 에러를 다시 던져 모달이 토스트·제출상태를 처리.
  async function handleCancelConfirm(reason?: string) {
    if (!currentMemberId) return;
    togglingRef.current = true;
    const prevCount = attdCount;
    const prevAttendees = attendees;
    const prevCanceled = canceledAttendees;
    setAttending(false);
    setAttdCount((c) => c - 1);
    setAttendees((list) => list.filter((a) => a.mem_id !== currentMemberId));
    // 취소 즉시 취소자 목록에 본인을 낙관적으로 올려 "흔적 없음"을 없앤다(재오픈·재조회 전에도 바로 보이게).
    setCanceledAttendees((list) => [
      {
        mem_id: currentMemberId,
        mem_nm: currentMemberName ?? "",
        avatar_url: currentMemberAvatarUrl ?? null,
        evt_at: dayjs().toISOString(),
        reason_txt: reason ?? null,
      },
      ...list.filter((c) => c.mem_id !== currentMemberId),
    ]);
    try {
      await toggleGatheringAttendance(gathering!.id, reason);
      setCancelDialogOpen(false);
      // 취소 성공 후 부가 갱신(달력·참석자 재조회)은 실패해도 취소 자체엔 영향 없어야 한다.
      // await하지 않고 호출하므로, 내부에서 reject되면 unhandled rejection이 되지 않도록 여기서 삼킨다.
      void Promise.resolve(onAttendanceChange?.()).catch((err) => {
        console.error("[gathering] 취소 후 갱신 실패", err);
      });
    } catch (e) {
      setAttending(true);
      setAttdCount(prevCount);
      setAttendees(prevAttendees);
      setCanceledAttendees(prevCanceled);
      throw e;
    } finally {
      togglingRef.current = false;
    }
  }

  async function handleDelete() {
    if (!gathering) return;
    if (!window.confirm(`'${gathering.title}'을 삭제하시겠습니까? 참석자들에게 알림이 발송됩니다.`)) return;
    setIsDeleting(true);
    try {
      await deleteGathering(gathering.id);
      onOpenChange(false);
      onDelete?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="h-[85dvh] max-h-[85dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>{gathering.title}</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription className="sr-only">모임 상세 정보</ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
          <div className="flex flex-col gap-4">
            {/* 뱃지 */}
            <div className="flex items-center gap-2">
              {typeLabel && (() => {
                const typeBadgeClass =
                  gathering.post_type === "regular"
                    ? "border-violet-400/60 bg-violet-50 text-violet-700"
                    : gathering.post_type === "event"
                      ? "border-violet-500 bg-violet-100 text-violet-800 font-medium"
                      : undefined;
                return (
                  <Badge
                    variant={typeBadgeClass ? "outline" : "secondary"}
                    className={typeBadgeClass}
                  >
                    {gathering.post_type === "event" ? `⭐ ${typeLabel}` : typeLabel}
                  </Badge>
                );
              })()}
              {sprtLabel && <Badge variant="outline">{sprtLabel}</Badge>}
            </div>

            {/* 날짜/시간/장소/인원 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Caption className="w-4 text-muted-foreground">📅</Caption>
                <Caption>{dateStr}</Caption>
              </div>
              <div className="flex items-center gap-2">
                <Caption className="w-4 text-muted-foreground">⏰</Caption>
                <Caption>{timeStr}</Caption>
              </div>
              {gathering.location && (
                <div className="flex items-center gap-2">
                  <Caption className="w-4 text-muted-foreground">📍</Caption>
                  {/* 장소는 자유 텍스트라 좌표가 아닌 네이버지도 "검색"으로 연결 (앱 설치 시 앱으로 열림) */}
                  <a
                    href={`https://map.naver.com/p/search/${encodeURIComponent(gathering.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1"
                  >
                    <Caption className="truncate underline decoration-border underline-offset-2">
                      {gathering.location}
                    </Caption>
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Caption className="w-4 text-muted-foreground">👥</Caption>
                <Caption>
                  참석 {attdCount}명
                  {gathering.maxPrtCnt != null && ` / 최대 ${gathering.maxPrtCnt}명`}
                </Caption>
              </div>
              {gathering.crt_by_nm && (
                <div className="flex items-center gap-2">
                  <Caption className="w-4 text-muted-foreground">✍️</Caption>
                  <Caption>{gathering.crt_by_nm}</Caption>
                </div>
              )}
            </div>

            {/* 비고 */}
            {gathering.cont_txt && (
              <div className="rounded-xl bg-secondary/50 px-4 py-3">
                <Caption className="whitespace-pre-wrap text-foreground">
                  {renderMentions(gathering.cont_txt, members)}
                </Caption>
              </div>
            )}

            {/* 참여 조건 — 모임 상세 페이지와 **같은 컴포넌트**로 그린다(문구·아이콘이 갈리지 않게). */}
            <GatheringJoinConditions conditions={myAply?.conditions.conditions ?? []} />

            {conditionLocked && !isPastLocked && (
              <Micro>참여 조건을 채우면 참석할 수 있어요.</Micro>
            )}

            {/* 승인제 모임은 참석 토글 대신 신청 버튼이 **같은 자리에** 선다.
                다른 화면으로 보내지 않는다 — 달력에서 연 사람에게 페이지 이동은 맥락을 끊고,
                신청은 버튼 하나로 끝나는 일이라 넓은 화면이 필요하지도 않다.
                (신청 "관리"만 모임 상세 페이지에 남는다 — 목록·메모를 봐야 하는 다른 일이라서.) */}
            {/* 비활성 회원은 신청 대신 안내 게이트로 — 일반 참석 버튼과 같은 어법이다. */}
            {currentMemberId && gathering.aprvReqYn && viewerInactive && (
              <Button variant="outline" className="w-full" onClick={() => setInactiveGateOpen(true)}>
                참가 신청
              </Button>
            )}

            {currentMemberId && gathering.aprvReqYn && !viewerInactive && (
              myAply ? (
                <GatheringApplyButton
                  gthrId={gathering.id}
                  state={myAply.state}
                  rejectReason={myAply.rejectReason}
                  conditionsOk={myAply.conditions.ok}
                  full={gathering.maxPrtCnt != null && attdCount >= gathering.maxPrtCnt}
                  sttAt={gathering.evt_stt_at ?? gathering.start_date}
                  pastLocked={isPastLocked}
                  onChanged={() => {
                    loadMyApplication();
                    // 승인 후 취소는 자리를 반납하므로 참석자 목록·인원수도 다시 받아야 한다.
                    onAttendanceChange?.();
                  }}
                />
              ) : (
                // 상태를 받아오기 전 — 버튼 자리를 비워 두면 레이아웃이 튄다.
                <Button disabled variant="outline" className="w-full">불러오는 중…</Button>
              )
            )}

            {/* 신청 관리 — 개설자·운영진에게만. 승인하면 아래 참석자 목록에 바로 나타난다. */}
            {canReview && gathering.aprvReqYn && applications && (
              <GatheringApplicationsSection
                gthrId={gathering.id}
                applications={applications}
                onChanged={() => {
                  loadMyApplication();
                  onAttendanceChange?.();
                }}
                onSelectMember={(memId, name) => setSelectedMember({ memId, name })}
              />
            )}

            {/* 참석 버튼 — 비활성 회원이면 참석 대신 안내 게이트를 연다 */}
            {currentMemberId && !gathering.aprvReqYn && (
              <Button
                onClick={viewerInactive ? () => setInactiveGateOpen(true) : handleToggleAttendance}
                // 처리 중엔 disabled 대신 handleToggleAttendance의 togglingRef 가드로 재클릭만 막아 흐려지지 않게.
                // 낙관적 업데이트로 색이 즉시 바뀌어 "바로 눌렸다"고 느끼게 한다.
                // detailLoading 중엔 내 참석 여부를 아직 몰라 토글이 꼬일 수 있으므로 잠근다.
                // 지난 모임은 참석/해제 불가(관리자 예외) — 서버에서도 차단.
                // 비활성 회원은 마감·잠금과 무관하게 눌러 안내 게이트를 열 수 있어야 하므로 disabled 제외.
                disabled={!viewerInactive && (isFull || detailLoading || isPastLocked || conditionLocked)}
                variant={attending ? "default" : "outline"}
                className={attending ? "w-full bg-success hover:bg-success/90 border-success" : "w-full"}
              >
                {/* 비활성이면 참석 유도 문구로 게이트를 열게 한다 */}
                {viewerInactive ? (
                  "참석하기"
                ) : (
                  <>
                    {/* 지난 모임·조건 미달: 문구 변경 없이 잠금 아이콘 + disabled 흐림으로만 표시 */}
                    {(isPastLocked || conditionLocked) && <Lock className="size-3.5" />}
                    {!isPastLocked && isFull ? "인원 마감" : attending ? "✅ 참석" : "참석하기"}
                  </>
                )}
              </Button>
            )}

            {/* 참석자 목록 (로딩 중엔 참석수만큼 스켈레톤 — 즉시 오픈 뒤 채워짐) */}
            {detailLoading && attendees.length === 0 ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: Math.max(1, Math.min(attdCount, 8)) }, (_, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-2.5 w-7 rounded" />
                  </div>
                ))}
              </div>
            ) : attendees.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {attendees.map((a) => (
                  <button
                    key={a.mem_id}
                    type="button"
                    onClick={() =>
                      setSelectedMember({ memId: a.mem_id, name: a.mem_nm ?? "" })
                    }
                    aria-label={`${a.mem_nm ?? "멤버"} 프로필 보기`}
                    className="flex flex-col items-center gap-0.5 rounded-lg p-0.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar src={a.avatar_url} seed={a.mem_id} alt={a.mem_nm ?? ""} size="sm" />
                    <Micro className="leading-tight">{a.mem_nm ?? ""}</Micro>
                  </button>
                ))}
              </div>
            ) : null}

            {/* 취소자 목록 — 상세 페이지(SG-03)와 동등한 회색 표시(취소 시각·사유). 카운트엔 미포함. */}
            <GatheringCanceledAttendees attendees={canceledAttendees} />

            {/* 등록 직후 공유 유도 안내 */}
            {showShareHint && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <Caption className="text-foreground">
                  🎉 모임이 등록됐어요!<br />아래 <span className="font-semibold text-primary">공유하기</span> 버튼을 눌러 단톡방에 알려주세요.
                </Caption>
              </div>
            )}

            {/* 공유/수정/삭제 (등록 직후 이 영역으로 자동 스크롤 — 안내+버튼이 함께 보이게) */}
            <div ref={shareHintRef} className="scroll-mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button
                variant={showShareHint ? "default" : "outline"}
                size="sm"
                className={showShareHint ? "animate-pulse" : undefined}
                onClick={(e) => {
                  (e.currentTarget as HTMLElement).blur();
                  setShowShareHint(false);
                  setShareOpen(true);
                }}
              >
                <Share2 className="size-3.5" />
                공유하기
              </Button>

              <div className="flex gap-2">
                {currentMemberId && onClone && (
                  // 로딩 중 복제하면 아직 안 채워진 정원(maxPrtCnt)이 빠진 채 복사될 수 있어 잠근다
                  <Button variant="outline" size="sm" onClick={onClone} disabled={detailLoading}>
                    <Copy className="size-3.5" />
                    복제
                  </Button>
                )}
                {(isAuthor || isAdmin) && !isPastLocked && (
                  <>
                    {/* 수정은 작성자 + 관리자 모두 가능 (RLS도 팀 owner/admin 허용). 지난 모임은 관리자만. */}
                    {/* 로딩 중 수정하면 아직 안 채워진 승인제·참여조건이 폼 기본값(꺼짐/없음)으로
                        들어가 **저장하는 순간 조용히 지워진다** — 복제를 잠그는 것과 같은 이유이고,
                        이쪽은 복사가 아니라 원본이 바뀌므로 더 위험하다. */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onEdit}
                      disabled={isDeleting || detailLoading}
                    >
                      <Pencil className="size-3.5" />
                      수정
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      <Trash2 className="size-3.5" />
                      {isDeleting ? "삭제 중..." : "삭제"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* 댓글 */}
            <div className="border-t border-border pt-4">
              <CommentSection
                entityType="gathering"
                entityId={gathering.id}
                teamId={teamId}
                currentMemberId={currentMemberId}
                viewerInactive={viewerInactive}
                viewerInactiveKind={viewerInactiveKind}
                currentMemberName={currentMemberName}
                currentMemberAvatarUrl={currentMemberAvatarUrl}
                isAdmin={isAdmin}
                members={members}
                initialComments={initialComments}
                // 위에서 뽑아 둔 gthrRef를 재사용한다 — 같은 폴백 규칙을 두 곳에 적으면
                // 한쪽만 바뀌었을 때 공유 URL과 로그인 복귀 경로가 조용히 어긋난다.
                loginReturnPath={`/schedule?gthr=${gthrRef}`}
              />
            </div>

            <div className="mt-4 flex justify-center">
              <ResponsiveDrawerClose asChild>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
                  닫기
                </Button>
              </ResponsiveDrawerClose>
            </div>
          </div>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>

    <ShareSheet
      open={shareOpen}
      onOpenChange={setShareOpen}
      title={gathering.title}
      timeLabel={shareDateTime}
      pageUrl={sharePageUrl}
      shareText={gthrShareText}
    />
    <InactiveGateDialog open={inactiveGateOpen} onOpenChange={setInactiveGateOpen} kind={viewerInactiveKind} />
    <GatheringCancelDialog
      open={cancelDialogOpen}
      onOpenChange={setCancelDialogOpen}
      sttAt={gathering.evt_stt_at ?? gathering.start_date}
      onConfirm={handleCancelConfirm}
    />
    <MemberCardDialog
      memId={selectedMember?.memId ?? null}
      memNm={selectedMember?.name}
      teamId={teamId}
      open={selectedMember !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedMember(null);
      }}
      stacked
    />

    </>
  );
}
