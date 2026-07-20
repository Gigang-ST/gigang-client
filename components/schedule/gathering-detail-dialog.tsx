"use client";

import { useEffect, useRef, useState } from "react";

import { Copy, ExternalLink, Lock, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { dayjs } from "@/lib/dayjs";
import { isPastLockedFor } from "@/lib/past-event";
import { gthrTypeLabels, gthrSprtLabels, type GthrType, type GthrSprtType } from "@/lib/validations/gathering";

import { deleteGathering } from "@/app/actions/gathering/manage-gathering";
import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";
import { GatheringCancelDialog } from "@/app/(info)/gatherings/[id]/gathering-cancel-dialog";


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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type GatheringAttendee = {
  mem_id: string;
  mem_nm: string | null;
  avatar_url: string | null;
};

export interface GatheringDetailDialogProps {
  gathering: (CalendarRace & {
    maxPrtCnt?: number | null;
    attendees?: GatheringAttendee[];
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
  // 참석 토글 재진입 가드 — 동기 ref로 같은 렌더 내 연타까지 막는다(리렌더 의존 state는 못 막음).
  // 버튼 흐림 없이 재클릭만 무시하므로 UI에 노출할 state는 불필요.
  const togglingRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 방금 등록한 직후에만 공유 유도 안내 노출. 공유하기를 누르면 숨긴다.
  const [showShareHint, setShowShareHint] = useState(justCreated ?? false);
  // 등록 직후 다이얼로그가 맨 위에서 열려 하단 공유 유도가 안 보이는 문제 → 공유 영역으로 스크롤
  const shareHintRef = useRef<HTMLDivElement>(null);

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
    setShowShareHint(justCreated ?? false);
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
  // 지난 모임(KST 날짜 기준)은 수정·삭제·참석 변경 불가 — 관리자만 예외 (서버 액션에서도 동일 검증)
  const isPastLocked = isPastLockedFor(isAdmin, gathering.evt_stt_at ?? gathering.start_date, gathering.evt_end_at);

  const stt = gathering.evt_stt_at ? dayjs(gathering.evt_stt_at).tz("Asia/Seoul") : dayjs(gathering.start_date);
  const end = gathering.evt_end_at ? dayjs(gathering.evt_end_at).tz("Asia/Seoul") : null;
  const dateStr = stt.format("YYYY년 M월 D일 (ddd)");
  const timeStr = end ? `${stt.format("HH:mm")} ~ ${end.format("HH:mm")}` : stt.format("HH:mm");

  const typeLabel = gthrTypeLabels[gathering.post_type as GthrType] ?? gathering.post_type;
  const sprtLabel = gathering.sprt_cd ? (gthrSprtLabels[gathering.sprt_cd as GthrSprtType] ?? gathering.sprt_cd) : null;

  // 공유 텍스트용
  const gthrRef = gathering.short_id ?? gathering.id;
  const sharePageUrl = typeof window !== "undefined"
    ? `${window.location.origin}/?gthr=${gthrRef}`
    : `/?gthr=${gthrRef}`;

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
    const myEntry = { mem_id: currentMemberId, mem_nm: currentMemberName ?? null, avatar_url: currentMemberAvatarUrl ?? null };
    setAttending(!prev);
    setAttdCount((c) => (!prev ? c + 1 : c - 1));
    setAttendees((list) => !prev ? [...list, myEntry] : list.filter((a) => a.mem_id !== currentMemberId));
    try {
      const result = await toggleGatheringAttendance(gathering!.id);
      setAttending(result.attending);
      if (result.attending && result.monthlyAttendCnt) {
        toast.success(`이번 달 ${result.monthlyAttendCnt}회 참여!`);
      }
      onAttendanceChange?.();
    } catch (e) {
      setAttending(prev);
      setAttdCount((c) => (prev ? c + 1 : c - 1));
      setAttendees(gathering!.attendees ?? []);
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
    setAttending(false);
    setAttdCount((c) => c - 1);
    setAttendees((list) => list.filter((a) => a.mem_id !== currentMemberId));
    try {
      await toggleGatheringAttendance(gathering!.id, reason);
      setCancelDialogOpen(false);
      onAttendanceChange?.();
    } catch (e) {
      setAttending(true);
      setAttdCount(prevCount);
      setAttendees(prevAttendees);
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

            {/* 참석 버튼 — 비활성 회원이면 참석 대신 안내 게이트를 연다 */}
            {currentMemberId && (
              <Button
                onClick={viewerInactive ? () => setInactiveGateOpen(true) : handleToggleAttendance}
                // 처리 중엔 disabled 대신 handleToggleAttendance의 togglingRef 가드로 재클릭만 막아 흐려지지 않게.
                // 낙관적 업데이트로 색이 즉시 바뀌어 "바로 눌렸다"고 느끼게 한다.
                // detailLoading 중엔 내 참석 여부를 아직 몰라 토글이 꼬일 수 있으므로 잠근다.
                // 지난 모임은 참석/해제 불가(관리자 예외) — 서버에서도 차단.
                // 비활성 회원은 마감·잠금과 무관하게 눌러 안내 게이트를 열 수 있어야 하므로 disabled 제외.
                disabled={!viewerInactive && (isFull || detailLoading || isPastLocked)}
                variant={attending ? "default" : "outline"}
                className={attending ? "w-full bg-success hover:bg-success/90 border-success" : "w-full"}
              >
                {/* 비활성이면 참석 유도 문구로 게이트를 열게 한다 */}
                {viewerInactive ? (
                  "참석하기"
                ) : (
                  <>
                    {/* 지난 모임: 문구 변경 없이 잠금 아이콘 + disabled 흐림으로만 표시 */}
                    {isPastLocked && <Lock className="size-3.5" />}
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
                  <div key={a.mem_id} className="flex flex-col items-center gap-0.5">
                    <Avatar src={a.avatar_url} seed={a.mem_id} alt={a.mem_nm ?? ""} size="sm" />
                    <Micro className="leading-tight">{a.mem_nm ?? ""}</Micro>
                  </div>
                ))}
              </div>
            ) : null}

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
                    <Button variant="outline" size="sm" onClick={onEdit} disabled={isDeleting}>
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
                loginReturnPath={`/?gthr=${gathering.short_id ?? gathering.id}`}
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

    </>
  );
}
