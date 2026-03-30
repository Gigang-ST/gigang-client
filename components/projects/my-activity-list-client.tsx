"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SPORT_LABELS, type Sport } from "@/lib/mileage";
import { deleteActivity } from "@/app/actions/mileage-run";
import { ActivityLogForm } from "./activity-log-form";

type ActivityEvent = {
  event_multiplier: { name: string };
  multiplier_snapshot: number;
};

export type ActivityLog = {
  id: string;
  activity_date: string;
  sport: string;
  distance_km: number;
  elevation_m: number;
  final_mileage: number;
  review: string | null;
  activity_log_event: ActivityEvent[];
  /** 이벤트 배율 ID 목록 (수정 시 폼에 전달) */
  event_multiplier_ids: string[];
};

type Props = {
  logs: ActivityLog[];
  participationId: string;
  projectId: string;
};

/**
 * 해당 기록이 전월 기록이면서 오늘이 4일 이상인지 확인.
 * 전월 기록은 매월 3일까지만 수정/삭제 가능.
 */
function isEditLocked(activityDate: string): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const todayMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const logMonth = activityDate.slice(0, 7);

  if (logMonth < todayMonth && now.getDate() > 3) {
    return true;
  }
  return false;
}

const INITIAL_DISPLAY_COUNT = 5;

export function MyActivityListClient({ logs, participationId, projectId }: Props) {
  const [editLog, setEditLog] = useState<ActivityLog | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);

  const visibleLogs = logs.slice(0, displayCount);
  const hasMore = logs.length > displayCount;

  const handleEdit = (log: ActivityLog) => {
    setEditLog(log);
    setSheetOpen(true);
  };

  const handleDelete = async (log: ActivityLog) => {
    setDeleting(log.id);
    try {
      const result = await deleteActivity(log.id, log.activity_date);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <ul className="space-y-3">
        {visibleLogs.map((log) => {
          const events = log.activity_log_event;
          const locked = isEditLocked(log.activity_date);

          return (
            <li key={log.id} className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {log.activity_date} · {SPORT_LABELS[log.sport as Sport]}
                </span>
                <span className="text-sm font-bold text-primary">
                  {Number(log.final_mileage).toFixed(1)} km
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                거리 {Number(log.distance_km).toFixed(1)} km
                {log.elevation_m > 0 && ` · 고도 ${log.elevation_m}m`}
              </p>
              {events.length > 0 && (
                <p className="text-xs text-blue-600">
                  {events
                    .map(
                      (e) =>
                        `${e.event_multiplier.name} x${e.multiplier_snapshot}`,
                    )
                    .join(", ")}
                </p>
              )}
              {log.review && (
                <p className="text-xs text-muted-foreground italic">
                  &ldquo;{log.review}&rdquo;
                </p>
              )}

              {/* 수정/삭제 버튼 */}
              <div className="flex items-center gap-2 pt-1">
                {locked ? (
                  <p className="text-xs text-muted-foreground">
                    전월 기록은 매월 3일까지만 수정/삭제 가능합니다.
                  </p>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => handleEdit(log)}
                    >
                      <Pencil className="size-3" />
                      수정
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={deleting === log.id}
                        >
                          <Trash2 className="size-3" />
                          {deleting === log.id ? "삭제 중..." : "삭제"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogTitle>기록 삭제</AlertDialogTitle>
                          <AlertDialogDescription>
                            {log.activity_date} {SPORT_LABELS[log.sport as Sport]}{" "}
                            {Number(log.distance_km).toFixed(1)}km 기록을 삭제하시겠습니까?
                            삭제된 기록은 복구할 수 없습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => handleDelete(log)}
                          >
                            삭제
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline"
            onClick={() => setDisplayCount((prev) => prev + INITIAL_DISPLAY_COUNT)}
          >
            더보기 ({logs.length - displayCount}개 남음)
          </button>
        </div>
      )}

      {/* 수정 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle>기록 수정</SheetTitle>
          </SheetHeader>
          {editLog && (
            <ActivityLogForm
              key={editLog.id}
              participationId={participationId}
              projectId={projectId}
              defaultValues={{
                id: editLog.id,
                activityDate: editLog.activity_date,
                sport: editLog.sport as Sport,
                distanceKm: String(editLog.distance_km),
                elevationM: String(editLog.elevation_m),
                review: editLog.review ?? "",
                eventMultiplierIds: editLog.event_multiplier_ids,
              }}
              onSuccess={() => {
                setSheetOpen(false);
                setEditLog(null);
                router.refresh();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
