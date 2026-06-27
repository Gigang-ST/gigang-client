"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChevronRight, Pencil, Trash2, Lock } from "lucide-react";

import { todayDayKST, currentMonthKST } from "@/lib/dayjs";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";

import { deleteActivity } from "@/app/actions/mileage-run";

import { Body, Caption, Micro } from "@/components/common/typography";
import { ActivityLogForm } from "@/components/projects/activity-log-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type ActivityRecord = {
  act_id: string;
  act_dt: string;
  sprt_enm: string;
  distance_km: number;
  elevation_m: number;
  base_mlg: number;
  applied_mults: { mult_id: string; mult_nm: string; mult_val: number }[];
  final_mlg: number;
  review: string | null;
};

type Props = {
  initialRecords: ActivityRecord[];
  evtId: string;
  memId: string;
  month: string;
  totalCount: number;
};

/** 전월 기록은 매월 3일까지만 수정/삭제 가능 (records-client와 동일 규칙) */
function isEditLocked(actDt: string): boolean {
  const todayMonth = currentMonthKST().slice(0, 7);
  const logMonth = actDt.slice(0, 7);
  return logMonth < todayMonth && todayDayKST() > 3;
}

export function MyActivityListClient({
  initialRecords,
  evtId,
  memId,
  totalCount,
}: Props) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<ActivityRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<ActivityRecord | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteActivity(deleteTarget.act_id);
    if (result.ok) {
      window.dispatchEvent(new Event("mileage:refresh"));
      router.refresh();
    } else {
      alert(result.message);
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleEditSuccess = () => {
    setEditTarget(null);
    window.dispatchEvent(new Event("mileage:refresh"));
    router.refresh();
  };

  if (initialRecords.length === 0) {
    return (
      <Caption className="py-4 text-center block">
        이번 달 기록이 없습니다.
      </Caption>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Caption className="font-semibold text-foreground">내 기록</Caption>
        <Caption>{totalCount}건</Caption>
      </div>

      <ul className="flex flex-col gap-2">
        {initialRecords.map((record) => {
          const locked = isEditLocked(record.act_dt);
          return (
            <li key={record.act_id}>
              <CardItem className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <Caption className="text-foreground">{record.act_dt}</Caption>
                      <Badge variant="secondary" className="text-[11px]">
                        {MILEAGE_SPORT_LABELS[record.sprt_enm as MileageSport] ?? record.sprt_enm}
                      </Badge>
                    </div>
                    {record.review && (
                      <Micro className="italic truncate">&ldquo;{record.review}&rdquo;</Micro>
                    )}
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <Body className="font-semibold">{record.final_mlg.toFixed(1)}</Body>
                    <Caption>{record.distance_km.toFixed(2)} km</Caption>
                  </div>
                </div>

                {locked ? (
                  <div className="flex items-center gap-1">
                    <Lock className="size-3 text-muted-foreground" />
                    <Micro>전월 기록은 매월 3일까지만 수정/삭제 가능</Micro>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={() => setEditTarget(record)}>
                      <Pencil className="size-3" />
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(record)}
                    >
                      <Trash2 className="size-3" />
                      삭제
                    </Button>
                  </div>
                )}
              </CardItem>
            </li>
          );
        })}
      </ul>

      <Button variant="outline" asChild className="w-full rounded-xl gap-1">
        <Link href="/projects/records">
          전체 기록 보기
          <ChevronRight className="size-4" />
        </Link>
      </Button>

      {/* 삭제 확인 */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>기록 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  {deleteTarget.act_dt}{" "}
                  {MILEAGE_SPORT_LABELS[deleteTarget.sprt_enm as MileageSport]}{" "}
                  {deleteTarget.distance_km.toFixed(2)}km 기록을 삭제하시겠습니까?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">취소</Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수정 Sheet */}
      <Sheet open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-2xl px-6" showCloseButton={false}>
          <SheetHeader className="px-0 pt-4 pb-0">
            <SheetTitle>기록 수정</SheetTitle>
          </SheetHeader>
          {editTarget && (
            <ActivityLogForm
              evtId={evtId}
              memId={memId}
              editData={editTarget}
              onSuccess={handleEditSuccess}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
