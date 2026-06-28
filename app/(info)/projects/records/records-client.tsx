"use client";

import { useEffect, useState, useCallback, useRef } from "react";

import { Pencil, Trash2, Lock } from "lucide-react";

import { todayDayKST, currentMonthKST, prevMonthStr } from "@/lib/dayjs";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
import { fetchActivityRecords, type ActivityRecord } from "@/lib/queries/activity-records";
import { createClient } from "@/lib/supabase/client";

import { deleteActivity } from "@/app/actions/mileage-run";

import { SegmentControl } from "@/components/common/segment-control";
import { H2, Body, Caption, Micro } from "@/components/common/typography";
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





type Props = {
  evtId: string;
  memId: string;
  prtId: string;
  evtStartDt: string;
  evtEndDt: string;
  initialMonth: string;
  initialRecords: ActivityRecord[];
};

function isEditLocked(actDt: string): boolean {
  const todayMonth = currentMonthKST().slice(0, 7);
  const logMonth = actDt.slice(0, 7);
  return logMonth < todayMonth && todayDayKST() > 3;
}

function buildMonthSegments(startDt: string, endDt: string) {
  const segments: { value: string; label: string }[] = [];
  // 연습월(시작-1)부터
  const practiceMonth = prevMonthStr(startDt.slice(0, 7) + "-01");
  let m = practiceMonth;
  const endMonth = endDt.slice(0, 7) + "-01";
  while (m <= endMonth) {
    const [, mm] = m.split("-").map(Number);
    segments.push({ value: m, label: `${mm}월` });
    const [y2, m2] = m.split("-").map(Number);
    const next = m2 === 12 ? `${y2 + 1}-01-01` : `${y2}-${String(m2 + 1).padStart(2, "0")}-01`;
    m = next;
  }
  return segments;
}

export function RecordsClient({ evtId, memId, prtId, evtStartDt, evtEndDt, initialMonth, initialRecords }: Props) {
  const segments = buildMonthSegments(evtStartDt, evtEndDt);

  // 첫 달은 서버에서 prefetch한 데이터로 시작 → 진입 시 깜빡임 없음
  const [month, setMonth] = useState(initialMonth);
  const [records, setRecords] = useState<ActivityRecord[]>(initialRecords);
  const [loading, setLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ActivityRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<ActivityRecord | null>(null);

  // 주입받은 prt_id로 바로 조회 (participant 재조회 제거). 서버 prefetch와 동일한 공용 헬퍼 사용.
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await fetchActivityRecords(createClient(), prtId, month));
    } finally {
      setLoading(false);
    }
  }, [prtId, month]);

  // 첫 마운트는 initialRecords(initialMonth)로 충분하므로 스킵하고, 월이 바뀔 때만 재조회한다.
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    loadRecords();
  }, [loadRecords]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteActivity(deleteTarget.act_id);
      if (result.ok) {
        loadRecords();
      } else {
        alert(result.message);
      }
    } catch {
      alert("삭제에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleEditSuccess = () => {
    setEditTarget(null);
    loadRecords();
  };

  const totalMlg = records.reduce((sum, r) => sum + r.final_mlg, 0);

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>내 기록 관리</H2>

      <SegmentControl
        segments={segments}
        value={month}
        onValueChange={setMonth}
      />

      <div className="flex items-center justify-between">
        <Caption>{records.length}건</Caption>
        <Caption className="font-semibold text-foreground">
          총 {totalMlg.toFixed(1)} km
        </Caption>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <Caption className="py-12 text-center block">
          이 달의 기록이 없습니다.
        </Caption>
      ) : (
        <ul className="flex flex-col gap-2">
          {records.map((record) => {
            const locked = isEditLocked(record.act_dt);
            const mults = record.applied_mults ?? [];
            return (
              <li key={record.act_id}>
                <CardItem className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Body className="font-semibold">{record.act_dt}</Body>
                      <Badge variant="secondary" className="text-[11px]">
                        {MILEAGE_SPORT_LABELS[record.sprt_enm as MileageSport] ?? record.sprt_enm}
                      </Badge>
                    </div>
                    <Body className="font-semibold">{record.final_mlg.toFixed(1)}</Body>
                  </div>

                  <Caption>
                    {record.distance_km.toFixed(2)} km
                    {record.elevation_m && record.elevation_m > 0 && ` · 상승 ${record.elevation_m}m`}
                  </Caption>

                  {mults.length > 0 && (
                    <Caption className="text-primary">
                      {record.base_mlg.toFixed(1)} → {record.final_mlg.toFixed(1)} (
                      {mults.map((m) => `${m.mult_nm} ×${m.mult_val}`).join(", ")}
                      )
                    </Caption>
                  )}

                  {record.review && (
                    <Micro className="italic">&ldquo;{record.review}&rdquo;</Micro>
                  )}

                  {locked ? (
                    <div className="flex items-center gap-1 pt-1">
                      <Lock className="size-3 text-muted-foreground" />
                      <Micro>전월 기록은 매월 3일까지만 수정/삭제 가능</Micro>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 pt-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setEditTarget(record)}
                      >
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
      )}

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
