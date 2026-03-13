"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, Pencil } from "lucide-react";

/* ---------- 유틸 ---------- */

function secondsToTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeStringToSeconds(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (h < 0 || m < 0 || m > 59 || s < 0 || s > 59) return null;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    if (m < 0 || s < 0 || s > 59) return null;
    return m * 60 + s;
  }
  return null;
}

/* ---------- 타입 ---------- */

interface RaceRecord {
  id: string;
  event_type: string;
  record_time_sec: number;
  race_name: string;
  race_date: string;
  swim_time_sec: number | null;
  bike_time_sec: number | null;
  run_time_sec: number | null;
}

/* ---------- 컴포넌트 ---------- */

export function RaceHistoryDialog({
  memberId,
  open,
  onOpenChange,
  onChanged,
}: {
  memberId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [records, setRecords] = useState<RaceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEditingId(null);
      fetchRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function fetchRecords() {
    setLoading(true);
    const { data } = await supabase
      .from("race_result")
      .select("id, event_type, record_time_sec, race_name, race_date, swim_time_sec, bike_time_sec, run_time_sec")
      .eq("member_id", memberId)
      .order("race_date", { ascending: false });
    setRecords((data as RaceRecord[]) ?? []);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase
      .from("race_result")
      .delete()
      .eq("id", id);
    if (error) return;
    setRecords((prev) => prev.filter((r) => r.id !== id));
    onChanged();
  }

  function startEdit(record: RaceRecord) {
    setEditingId(record.id);
    setEditTime(secondsToTime(record.record_time_sec));
  }

  async function handleSaveEdit(id: string) {
    const seconds = timeStringToSeconds(editTime);
    if (seconds === null) return;
    setSaving(true);
    const { error } = await supabase
      .from("race_result")
      .update({ record_time_sec: seconds })
      .eq("id", id);
    setSaving(false);
    if (error) return;
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, record_time_sec: seconds } : r)),
    );
    setEditingId(null);
    onChanged();
  }

  const eventLabel = (et: string) => {
    if (et.startsWith("TRIATHLON_")) return `철인3종 ${et.replace("TRIATHLON_", "")}`;
    return et;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>과거 기록</DialogTitle>
          <DialogDescription>기록을 조회하고 수정하거나 삭제할 수 있습니다.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">등록된 기록이 없습니다.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {r.race_name}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {eventLabel(r.event_type)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{r.race_date}</span>

                  {editingId === r.id ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        placeholder="HH:MM:SS"
                        className="h-8 w-32 font-mono text-sm"
                      />
                      <button
                        type="button"
                        disabled={saving || timeStringToSeconds(editTime) === null}
                        onClick={() => handleSaveEdit(r.id)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {saving ? "..." : "저장"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs text-muted-foreground"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <span className="font-mono text-base font-bold text-foreground">
                      {secondsToTime(r.record_time_sec)}
                    </span>
                  )}
                </div>

                {editingId !== r.id && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
