"use client";

import { useState } from "react";

import { Pencil, Share2, Trash2 } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { gthrTypeLabels, gthrSprtLabels, type GthrType, type GthrSprtType } from "@/lib/validations/gathering";

import { deleteGathering } from "@/app/actions/gathering/manage-gathering";
import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";


import type { CmntRow } from "@/components/comment/comment-item";
import { CommentSection } from "@/components/comment/comment-section";
import { renderMentions, type MemberOption } from "@/components/comment/mention-input";
import { Avatar } from "@/components/common/avatar";
import { ShareSheet } from "@/components/common/share-sheet";
import {
  ResponsiveDrawer,
  ResponsiveDrawerClose,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import type { CalendarRace } from "@/components/home/mini-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  currentMemberName?: string | null;
  isAdmin?: boolean;
  isAttending?: boolean;
  members: MemberOption[];
  initialComments?: CmntRow[];
  onEdit?: () => void;
  onDelete?: () => void;
  onAttendanceChange?: () => void;
}

export function GatheringDetailDialog({
  gathering,
  open,
  onOpenChange,
  teamId,
  currentMemberId,
  currentMemberName,
  isAdmin,
  isAttending: initialIsAttending,
  members,
  initialComments,
  onEdit,
  onDelete,
  onAttendanceChange,
}: GatheringDetailDialogProps) {
  const [attending, setAttending] = useState(initialIsAttending ?? false);
  const [attdCount, setAttdCount] = useState(gathering?.regCount ?? 0);
  const [attendees, setAttendees] = useState(gathering?.attendees ?? []);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // gathering이 바뀌면 상태 동기화
  const gKey = gathering?.id;
  const [lastGKey, setLastGKey] = useState(gKey);
  if (gKey !== lastGKey) {
    setLastGKey(gKey);
    setAttending(initialIsAttending ?? false);
    setAttdCount(gathering?.regCount ?? 0);
    setAttendees(gathering?.attendees ?? []);
  }

  if (!gathering) return null;

  const isAuthor = currentMemberId === gathering.crt_by;
  const isFull = !attending && gathering.maxPrtCnt != null && attdCount >= gathering.maxPrtCnt;

  const stt = gathering.evt_stt_at ? dayjs(gathering.evt_stt_at).tz("Asia/Seoul") : dayjs(gathering.start_date);
  const end = gathering.evt_end_at ? dayjs(gathering.evt_end_at).tz("Asia/Seoul") : null;
  const dateStr = stt.format("YYYY년 M월 D일 (ddd)");
  const timeStr = end ? `${stt.format("HH:mm")} ~ ${end.format("HH:mm")}` : stt.format("HH:mm");

  const typeLabel = gthrTypeLabels[gathering.post_type as GthrType] ?? gathering.post_type;
  const sprtLabel = gathering.sprt_cd ? (gthrSprtLabels[gathering.sprt_cd as GthrSprtType] ?? gathering.sprt_cd) : null;

  // 공유 텍스트용
  const shareTitle = gathering.maxPrtCnt != null
    ? `[${gathering.title}] - ${gathering.maxPrtCnt}명`
    : `[${gathering.title}]`;
  const shareTimeLabel = end
    ? `${stt.format("YYYY년 M월 D일 (ddd) HH:mm")} ~ ${stt.format("YYYY-MM-DD") === end.format("YYYY-MM-DD") ? end.format("HH:mm") : end.format("YYYY년 M월 D일 (ddd) HH:mm")}`
    : stt.format("YYYY년 M월 D일 (ddd) HH:mm");
  const gthrRef = gathering.short_id ?? gathering.id;
  const sharePageUrl = typeof window !== "undefined"
    ? `${window.location.origin}/?gthr=${gthrRef}`
    : `/?gthr=${gthrRef}`;

  async function handleToggleAttendance() {
    if (!currentMemberId || isFull || isToggling) return;
    setIsToggling(true);
    const prev = attending;
    const myEntry = { mem_id: currentMemberId, mem_nm: currentMemberName ?? null, avatar_url: null };
    setAttending(!prev);
    setAttdCount((c) => (!prev ? c + 1 : c - 1));
    setAttendees((list) => !prev ? [...list, myEntry] : list.filter((a) => a.mem_id !== currentMemberId));
    try {
      const result = await toggleGatheringAttendance(gathering!.id);
      setAttending(result.attending);
      onAttendanceChange?.();
    } catch {
      setAttending(prev);
      setAttdCount((c) => (prev ? c + 1 : c - 1));
      setAttendees(gathering!.attendees ?? []);
    } finally {
      setIsToggling(false);
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
              {typeLabel && <Badge variant="secondary">{typeLabel}</Badge>}
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
                  <Caption>{gathering.location}</Caption>
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

            {/* 참석 버튼 */}
            {currentMemberId && (
              <Button
                onClick={handleToggleAttendance}
                disabled={isToggling || isFull}
                variant={attending ? "default" : "outline"}
                className={attending ? "w-full bg-success hover:bg-success/90 border-success" : "w-full"}
              >
                {isFull ? "인원 마감" : attending ? "✅ 참석" : "참석하기"}
              </Button>
            )}

            {/* 참석자 목록 */}
            {attendees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attendees.map((a) => (
                  <div key={a.mem_id} className="flex flex-col items-center gap-0.5">
                    <Avatar src={a.avatar_url} alt={a.mem_nm ?? ""} size="sm" className="size-4" />
                    <span className="text-[9px] text-muted-foreground leading-tight">{a.mem_nm ?? ""}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 공유/수정/삭제 */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setShareOpen(true); }}
              >
                <Share2 className="size-3.5" />
                공유하기
              </Button>

              {(isAuthor || isAdmin) && (
                <div className="flex gap-2">
                  {isAuthor && (
                    <Button variant="outline" size="sm" onClick={onEdit} disabled={isDeleting}>
                      <Pencil className="size-3.5" />
                      수정
                    </Button>
                  )}
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
                </div>
              )}
            </div>

            {/* 댓글 */}
            <div className="border-t border-border pt-4">
              <CommentSection
                entityType="gathering"
                entityId={gathering.id}
                teamId={teamId}
                currentMemberId={currentMemberId}
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
      title={shareTitle}
      timeLabel={shareTimeLabel}
      locationText={gathering.location ?? undefined}
      contentSnippet={gathering.cont_txt ?? undefined}
      pageUrl={sharePageUrl}
    />
    </>
  );
}
