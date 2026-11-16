"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";

import { InfoRow } from "@/components/common/info-row";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dayjs,
  formatKST,
  secondsToTime as formatTime,
  timeStringToSeconds as parseTime,
} from "@/lib/dayjs";

import type { AdminRecordRow, RecordIssue } from "./records-view";

/**
 * 기록 상세 — 줄을 누르면 열린다(폰은 바텀 시트, 데스크톱은 다이얼로그).
 * 고칠 수 있는 건 예전과 같이 **기록 시간과 삭제뿐**이다(종목·대회일 수정은 범위 밖 — #679).
 * 걸린 이상이 있으면 맨 위에 이유를 적는다 — 배지만으로는 왜 걸렸는지 모른다.
 */
export function RecordDetailDrawer({
  record,
  issues,
  onOpenChange,
  onUpdateTime,
  onDelete,
}: {
  record: AdminRecordRow | null;
  issues: readonly RecordIssue[] | undefined;
  onOpenChange: (open: boolean) => void;
  onUpdateTime: (record: AdminRecordRow, timeSec: number) => Promise<boolean>;
  onDelete: (record: AdminRecordRow) => Promise<boolean>;
}) {
  return (
    <ResponsiveDrawer open={record != null} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent dialogClassName="sm:max-w-md">
        {record && (
          // 기록이 바뀌면 편집 상태를 새로 시작한다
          <RecordDetailBody key={record.id} record={record} issues={issues} onUpdateTime={onUpdateTime} onDelete={onDelete} />
        )}
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}

function RecordDetailBody({
  record,
  issues,
  onUpdateTime,
  onDelete,
}: {
  record: AdminRecordRow;
  issues: readonly RecordIssue[] | undefined;
  onUpdateTime: (record: AdminRecordRow, timeSec: number) => Promise<boolean>;
  onDelete: (record: AdminRecordRow) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [editTime, setEditTime] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const timeSec = parseTime(editTime);
    if (timeSec === null) {
      alert("시간 형식이 올바르지 않습니다 (H:MM:SS 또는 M:SS)");
      return;
    }
    setBusy(true);
    const ok = await onUpdateTime(record, timeSec);
    setBusy(false);
    if (ok) setEditing(false);
  };

  const remove = async () => {
    setBusy(true);
    await onDelete(record);
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4 px-6 pb-6">
      <ResponsiveDrawerHeader className="px-0 text-left">
        <ResponsiveDrawerTitle>{record.memNm ?? "이름 없음"}</ResponsiveDrawerTitle>
        <ResponsiveDrawerDescription>{record.eventLabel}</ResponsiveDrawerDescription>
      </ResponsiveDrawerHeader>

      {issues && issues.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2.5">
          {issues.map((i) => (
            <Caption key={i.kind} className="flex items-start gap-1.5 text-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                <span className="font-semibold">{i.label}</span> — {i.detail}
              </span>
            </Caption>
          ))}
        </div>
      )}

      <div>
        <InfoRow label="대회" value={record.raceName ?? "-"} />
        <InfoRow label="대회일" value={record.raceDate ? dayjs(record.raceDate).format("YYYY.MM.DD") : "-"} />
        <InfoRow label="등록" value={formatKST(record.createdAt, "YYYY.MM.DD HH:mm", "-")} />
        {editing ? (
          <div className="flex items-center justify-between gap-3 border-b border-border py-2">
            <span className="text-[13px] text-muted-foreground">기록</span>
            <Input
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              placeholder="H:MM:SS"
              inputMode="numeric"
              className="h-9 w-32 text-right font-mono tabular-nums"
              autoFocus
            />
          </div>
        ) : (
          <InfoRow
            label="기록"
            value={<span className="text-base font-bold tabular-nums">{formatTime(record.recordTimeSec)}</span>}
          />
        )}
      </div>

      {editing ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>
            취소
          </Button>
          <Button onClick={save} disabled={busy}>
            저장
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setEditTime(formatTime(record.recordTimeSec));
              setEditing(true);
            }}
            disabled={busy}
          >
            <Pencil className="size-4" />
            시간 수정
          </Button>
          <Button
            variant="outline"
            onClick={remove}
            disabled={busy}
            className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="size-4" />
            삭제
          </Button>
        </div>
      )}
    </div>
  );
}
