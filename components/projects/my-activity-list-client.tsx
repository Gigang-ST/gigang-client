"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Body, Caption, Micro } from "@/components/common/typography";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
import { createClient } from "@/lib/supabase/client";
import { deleteActivity } from "@/app/actions/mileage-run";
import { todayKST, todayDayKST, currentMonthKST } from "@/lib/dayjs";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

export type ActivityRecord = {
  act_id: string;
  act_dt: string;
  sport_cd: string;
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
  /** 'YYYY-MM-01' 형식 */
  month: string;
};

// ─────────────────────────────────────────
// 날짜 잠금 여부
// 전월 기록이고 오늘이 4일 이상이면 잠금
// ─────────────────────────────────────────

function isEditLocked(actDt: string): boolean {
  const todayMonth = currentMonthKST().slice(0, 7); // 'YYYY-MM'
  const logMonth = actDt.slice(0, 7);
  if (logMonth < todayMonth && todayDayKST() > 3) {
    return true;
  }
  return false;
}

// ─────────────────────────────────────────
// 배율 표시 텍스트
// ─────────────────────────────────────────

function MultsLabel({
  applied_mults,
  base_mlg,
  final_mlg,
}: {
  applied_mults: ActivityRecord["applied_mults"];
  base_mlg: number;
  final_mlg: number;
}) {
  if (applied_mults.length === 0) return null;
  const multText = applied_mults
    .map((m) => `${m.mult_nm} ×${m.mult_val}`)
    .join(", ");
  return (
    <Caption className="text-primary">
      {base_mlg.toFixed(2)} → {final_mlg.toFixed(2)} km ({multText})
    </Caption>
  );
}

// ─────────────────────────────────────────
// 개별 기록 카드
// ─────────────────────────────────────────

type RecordCardProps = {
  record: ActivityRecord;
  onEdit: (record: ActivityRecord) => void;
  onDelete: (record: ActivityRecord) => void;
  deleting: boolean;
};

function RecordCard({ record, onEdit, onDelete, deleting }: RecordCardProps) {
  const locked = isEditLocked(record.act_dt);
  const hasMult = record.applied_mults.length > 0;

  return (
    <CardItem className="flex flex-col gap-2">
      {/* 헤더: 날짜 + 종목 배지 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Body className="font-semibold">{record.act_dt}</Body>
          <Badge variant="secondary" className="text-[11px]">
            {MILEAGE_SPORT_LABELS[record.sport_cd as MileageSport] ?? record.sport_cd}
          </Badge>
        </div>
        {locked && <Lock className="size-3.5 text-muted-foreground" />}
      </div>

      {/* 거리 + 고도 */}
      <Caption>
        {record.distance_km.toFixed(1)} km
        {record.elevation_m > 0 && ` · 상승 ${record.elevation_m}m`}
      </Caption>

      {/* 배율 정보 */}
      {hasMult ? (
        <MultsLabel
          applied_mults={record.applied_mults}
          base_mlg={record.base_mlg}
          final_mlg={record.final_mlg}
        />
      ) : (
        <Caption>{record.final_mlg.toFixed(2)} km</Caption>
      )}

      {/* 후기 */}
      {record.review && (
        <Micro className="italic">&ldquo;{record.review}&rdquo;</Micro>
      )}

      {/* 수정/삭제 버튼 */}
      {locked ? (
        <Caption className="text-[11px]">전월 기록은 매월 3일까지만 수정/삭제 가능합니다.</Caption>
      ) : (
        <div className="flex items-center gap-1 pt-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onEdit(record)}
          >
            <Pencil />
            수정
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(record)}
            disabled={deleting}
          >
            <Trash2 />
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      )}
    </CardItem>
  );
}

// ─────────────────────────────────────────
// 메인 클라이언트 컴포넌트
// ─────────────────────────────────────────

const PAGE_SIZE = 5;

export function MyActivityListClient({
  initialRecords,
  evtId,
  memId,
  month,
}: Props) {
  const router = useRouter();
  const [records, setRecords] = useState<ActivityRecord[]>(initialRecords);
  const [hasMore, setHasMore] = useState(initialRecords.length === PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  // 삭제 확인 Dialog
  const [deleteTarget, setDeleteTarget] = useState<ActivityRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 수정 Sheet (Task 10에서 ActivityLogForm 연결 예정)
  const [editTarget, setEditTarget] = useState<ActivityRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── 더보기: 클라이언트에서 추가 fetch ──

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const supabase = createClient();
      const monthEnd =
        (() => {
          const [y, m] = month.split("-").map(Number);
          const nextM = m === 12 ? 1 : m + 1;
          const nextY = m === 12 ? y + 1 : y;
          return `${nextY}-${String(nextM).padStart(2, "0")}-01`;
        })();

      const { data: logs } = await supabase
        .from("evt_mlg_act_hist")
        .select(
          "act_id, act_dt, sport_cd, distance_km, elevation_m, base_mlg, applied_mults, final_mlg, review",
        )
        .eq("evt_id", evtId)
        .eq("mem_id", memId)
        .gte("act_dt", month)
        .lt("act_dt", monthEnd)
        .order("act_dt", { ascending: false })
        .range(records.length, records.length + PAGE_SIZE - 1);

      if (!logs || logs.length === 0) {
        setHasMore(false);
        return;
      }

      const newRecords: ActivityRecord[] = logs.map((log) => ({
        act_id: log.act_id,
        act_dt: log.act_dt,
        sport_cd: log.sport_cd,
        distance_km: Number(log.distance_km),
        elevation_m: Number(log.elevation_m),
        base_mlg: Number(log.base_mlg),
        applied_mults: (log.applied_mults ?? []) as ActivityRecord["applied_mults"],
        final_mlg: Number(log.final_mlg),
        review: log.review ?? null,
      }));

      setRecords((prev) => [...prev, ...newRecords]);
      setHasMore(newRecords.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  // ── 삭제 ──

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteActivity(deleteTarget.act_id, deleteTarget.act_dt);
      if (result.message) {
        alert(result.message);
      } else {
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── 수정 ──

  const handleEdit = (record: ActivityRecord) => {
    setEditTarget(record);
    setSheetOpen(true);
  };

  if (records.length === 0) {
    return (
      <Caption className="py-4 text-center block">
        이번 달 기록이 없습니다.
      </Caption>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {records.map((record) => (
          <li key={record.act_id}>
            <RecordCard
              record={record}
              onEdit={handleEdit}
              onDelete={setDeleteTarget}
              deleting={deleting && deleteTarget?.act_id === record.act_id}
            />
          </li>
        ))}
      </ul>

      {/* 더보기 버튼 */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "불러오는 중..." : "더보기"}
          </Button>
        </div>
      )}

      {/* 삭제 확인 Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>기록 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  {deleteTarget.act_dt}{" "}
                  {MILEAGE_SPORT_LABELS[deleteTarget.sport_cd as MileageSport]}{" "}
                  {deleteTarget.distance_km.toFixed(1)}km 기록을 삭제하시겠습니까?
                  <br />
                  삭제된 기록은 복구할 수 없습니다.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                취소
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수정 Sheet — ActivityLogForm은 Task 10에서 연결 예정 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90svh] overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>기록 수정</SheetTitle>
          </SheetHeader>
          {/* TODO(Task 10): ActivityLogForm 연결 */}
          {editTarget && (
            <Caption className="text-center block py-8">
              ActivityLogForm 연결 예정 (Task 10)
            </Caption>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
