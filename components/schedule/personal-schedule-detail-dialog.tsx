"use client";

import { useState } from "react";

import { Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { dayjs } from "@/lib/dayjs";
import { raceTimeKST } from "@/lib/personal-schedule";

import { deletePersonalSchedule } from "@/app/actions/schedule/manage-personal-schedule";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption, Micro } from "@/components/common/typography";
import type { CalendarRace } from "@/components/home/mini-calendar";
import { Button } from "@/components/ui/button";

export type PersonalScheduleDetailDialogProps = {
  schedule: CalendarRace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onClone: () => void;
  /** 삭제가 끝난 뒤(달력 갱신용) */
  onDeleted: () => void;
};

/**
 * 개인 일정 상세 — 모임 상세(`GatheringDetailDialog`)와 같은 판을 쓴다(서랍 · 📅⏰ 줄 · 비고 상자 ·
 * 우측 복제/수정/삭제). 같은 탭에서 눌러 여는 것들이라 하나만 생김새가 다르면 다른 화면처럼 읽힌다.
 *
 * 모임에만 있는 것(공유·참석·참석자·댓글)은 없다 — 본인만 보는 일정이라 나눌 상대가 없다.
 * 지난 일정 잠금도 없다: 내 기록이라 지난 것도 고치고 지울 수 있어야 한다.
 */
export function PersonalScheduleDetailDialog({
  schedule,
  open,
  onOpenChange,
  onEdit,
  onClone,
  onDeleted,
}: PersonalScheduleDetailDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!schedule) return null;

  // sch_dt(date)라 tz 없이 그대로 찍어도 날짜가 밀리지 않는다(§AGENTS 날짜 규칙)
  const dateStr = dayjs(schedule.start_date).format("YYYY년 M월 D일 (ddd)");
  const stt = raceTimeKST(schedule.evt_stt_at);
  const end = raceTimeKST(schedule.evt_end_at);
  const timeStr = stt ? (end ? `${stt} ~ ${end}` : stt) : "종일";

  async function handleDelete() {
    if (!schedule || !window.confirm(`'${schedule.title}'을 삭제할까요?`)) return;
    setIsDeleting(true);
    try {
      await deletePersonalSchedule(schedule.id);
      toast.success("개인 일정을 삭제했어요.");
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="max-h-[85dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>{schedule.title}</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription className="sr-only">개인 일정 상세 정보</ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
          <div className="flex flex-col gap-4">
            {/* 뱃지 — 모임의 유형 뱃지 자리. 누구에게 보이는지가 이 일정의 유일한 분류다 */}
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-personal/40 bg-personal/10 px-2 py-0.5 text-[12px] font-medium text-personal">
                개인
              </span>
              <Micro>나만 볼 수 있어요</Micro>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Caption className="w-4 text-muted-foreground">📅</Caption>
                <Caption>{dateStr}</Caption>
              </div>
              <div className="flex items-center gap-2">
                <Caption className="w-4 text-muted-foreground">⏰</Caption>
                <Caption>{timeStr}</Caption>
              </div>
            </div>

            {schedule.cont_txt && (
              <div className="rounded-xl bg-secondary/50 px-4 py-3">
                <Caption className="whitespace-pre-wrap text-foreground">{schedule.cont_txt}</Caption>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClone} disabled={isDeleting}>
                <Copy className="size-3.5" />
                복제
              </Button>
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
            </div>
          </div>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
