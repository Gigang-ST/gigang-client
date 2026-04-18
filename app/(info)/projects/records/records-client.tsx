"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import { H2, Body, Caption, Micro } from "@/components/common/typography";
import { SegmentControl } from "@/components/common/segment-control";
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
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
import { createClient } from "@/lib/supabase/client";
import { deleteActivity } from "@/app/actions/mileage-run";
import { todayDayKST, currentMonthKST, prevMonthStr } from "@/lib/dayjs";
import { ActivityLogForm } from "@/components/projects/activity-log-form";

type ActivityRecord = {
  act_id: string;
  act_dt: string;
  sport_cd: string;
  distance_km: number;
  elevation_m: number | null;
  base_mlg: number;
  applied_mults: { mult_id: string; mult_nm: string; mult_val: number }[] | null;
  final_mlg: number;
  review: string | null;
};

type Props = {
  evtId: string;
  memId: string;
  evtStartDt: string;
  evtEndDt: string;
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

export function RecordsClient({ evtId, memId, evtStartDt, evtEndDt }: Props) {
  const router = useRouter();
  const curMonth = currentMonthKST();
  const segments = buildMonthSegments(evtStartDt, evtEndDt);

  // 현재월이 범위 내이면 현재월, 아니면 첫 번째 세그먼트
  const defaultMonth = segments.find((s) => s.value === curMonth)
    ? curMonth
    : segments[0]?.value ?? curMonth;

  const [month, setMonth] = useState(defaultMonth);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<ActivityRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<ActivityRecord | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [y, m] = month.split("-").map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

    const { data } = await supabase
      .from("evt_mlg_act_hist")
      .select("act_id, act_dt, sport_cd, distance_km, elevation_m, base_mlg, applied_mults, final_mlg, review")
      .eq("evt_id", evtId)
      .eq("mem_id", memId)
      .gte("act_dt", month)
      .lt("act_dt", monthEnd)
      .order("act_dt", { ascending: false });

    setRecords(
      (data ?? []).map((r) => ({
        ...r,
        distance_km: Number(r.distance_km),
        elevation_m: r.elevation_m ? Number(r.elevation_m) : null,
        base_mlg: Number(r.base_mlg),
        applied_mults: (r.applied_mults ?? null) as ActivityRecord["applied_mults"],
        final_mlg: Number(r.final_mlg),
        review: r.review ?? null,
      })),
    );
    setLoading(false);
  }, [evtId, memId, month]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteActivity(deleteTarget.act_id, deleteTarget.act_dt);
    if (result.ok) {
      loadRecords();
    } else {
      alert(result.message);
    }
    setDeleting(false);
    setDeleteTarget(null);
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
                        {MILEAGE_SPORT_LABELS[record.sport_cd as MileageSport] ?? record.sport_cd}
                      </Badge>
                    </div>
                    <Body className="font-semibold">{record.final_mlg.toFixed(1)}</Body>
                  </div>

                  <Caption>
                    {record.distance_km.toFixed(1)} km
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
                  {MILEAGE_SPORT_LABELS[deleteTarget.sport_cd as MileageSport]}{" "}
                  {deleteTarget.distance_km.toFixed(1)}km 기록을 삭제하시겠습니까?
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
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
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
