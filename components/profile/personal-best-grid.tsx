"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const PB_EVENTS = [
  { type: "FULL", label: "FULL" },
  { type: "HALF", label: "HALF" },
  { type: "10K", label: "10K" },
  { type: "5K", label: "5K" },
] as const;

type EventType = (typeof PB_EVENTS)[number]["type"];

type PbRecord = {
  event_type: string;
  record_time_sec: number;
  race_name: string;
  race_date: string;
};

type CompetitionRow = {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
};

function secondsToTime(sec: number) {
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
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function PersonalBestGrid({
  memberId,
  initialRecords,
}: {
  memberId: string;
  initialRecords: PbRecord[];
}) {
  const [records, setRecords] = useState<PbRecord[]>(initialRecords);
  const [editingEvent, setEditingEvent] = useState<EventType | null>(null);
  const [timeInput, setTimeInput] = useState("");
  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);

  const pbMap = new Map<string, PbRecord>();
  records.forEach((r) => pbMap.set(r.event_type, r));

  const openEdit = (eventType: EventType) => {
    const existing = pbMap.get(eventType);
    setEditingEvent(eventType);
    setMessage(null);
    setManualEntry(false);
    if (existing) {
      setTimeInput(secondsToTime(existing.record_time_sec));
      setRaceName(existing.race_name);
      setRaceDate(existing.race_date);
    } else {
      setTimeInput("");
      setRaceName("");
      setRaceDate("");
    }
  };

  const handleSave = async () => {
    if (!editingEvent) return;
    setSaving(true);
    setMessage(null);

    if (!raceName.trim()) {
      setMessage("대회를 선택하거나 입력해 주세요.");
      setSaving(false);
      return;
    }
    if (!raceDate) {
      setMessage("대회 날짜를 입력해 주세요.");
      setSaving(false);
      return;
    }
    const sec = timeStringToSeconds(timeInput);
    if (!sec || sec <= 0) {
      setMessage("기록을 MM:SS 또는 HH:MM:SS 형식으로 입력해 주세요.");
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("personal_best").upsert(
      {
        member_id: memberId,
        event_type: editingEvent,
        record_time_sec: sec,
        race_name: raceName.trim(),
        race_date: raceDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id,event_type" },
    );

    if (error) {
      setMessage("저장에 실패했습니다.");
      setSaving(false);
      return;
    }

    setRecords((prev) => {
      const next = prev.filter((r) => r.event_type !== editingEvent);
      next.push({
        event_type: editingEvent,
        record_time_sec: sec,
        race_name: raceName.trim(),
        race_date: raceDate,
      });
      return next;
    });
    setEditingEvent(null);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("personal_best")
      .delete()
      .eq("member_id", memberId)
      .eq("event_type", editingEvent);

    if (error) {
      setMessage("삭제에 실패했습니다.");
      setSaving(false);
      return;
    }

    setRecords((prev) => prev.filter((r) => r.event_type !== editingEvent));
    setEditingEvent(null);
    setSaving(false);
  };

  const hasRecord = editingEvent ? pbMap.has(editingEvent) : false;

  return (
    <>
      <div className="flex flex-col gap-4">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          PERSONAL BEST
        </span>
        <div className="grid grid-cols-2 gap-3">
          {PB_EVENTS.map((evt, i) => {
            const pb = pbMap.get(evt.type);
            return (
              <button
                key={evt.type}
                type="button"
                onClick={() => openEdit(evt.type)}
                className={`flex flex-col gap-1 rounded-xl p-4 text-left transition-colors active:scale-[0.98] ${i < 2 ? "border-[1.5px] border-border" : "bg-secondary"}`}
              >
                <span className="text-xs font-semibold text-primary">
                  {evt.label}
                </span>
                <span className="font-mono text-xl font-bold text-foreground">
                  {pb ? secondsToTime(pb.record_time_sec) : "--:--"}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {pb?.race_name ?? "탭하여 기록 추가"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={editingEvent !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEvent(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingEvent} 기록 편집</DialogTitle>
            <DialogDescription>
              기록과 대회 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 flex flex-col gap-4 overflow-y-auto px-1">
            {/* 기록 입력 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                기록 (MM:SS 또는 HH:MM:SS)
              </label>
              <Input
                placeholder="예: 23:45 또는 1:45:30"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 대회 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                대회
              </label>
              {raceName && !manualEntry ? (
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border-[1.5px] border-border px-4 py-3">
                    <span className="truncate text-sm font-medium text-foreground">
                      {raceName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {raceDate}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="shrink-0 rounded-lg border-[1.5px] border-border px-3 py-2 text-sm font-medium text-foreground"
                  >
                    변경
                  </button>
                </div>
              ) : manualEntry ? (
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="대회명"
                    value={raceName}
                    onChange={(e) => setRaceName(e.target.value)}
                    className="h-12 rounded-xl border-[1.5px] text-[15px]"
                  />
                  <Input
                    type="date"
                    value={raceDate}
                    onChange={(e) => setRaceDate(e.target.value)}
                    className="h-12 rounded-xl border-[1.5px] text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setManualEntry(false);
                      setSearchOpen(true);
                    }}
                    className="self-start text-xs text-muted-foreground underline"
                  >
                    대회 검색으로 돌아가기
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-border px-4 text-[15px] text-muted-foreground"
                  >
                    <Search className="size-4" />
                    대회를 검색하세요...
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualEntry(true)}
                    className="self-start text-xs text-muted-foreground underline"
                  >
                    목록에 없는 대회 직접 입력
                  </button>
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-[48px] flex-1 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              {hasRecord && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="h-[48px] rounded-xl border-[1.5px] border-border px-5 text-base font-medium text-destructive disabled:opacity-50"
                >
                  삭제
                </button>
              )}
            </div>

            {message && (
              <p className="text-sm text-destructive">{message}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Competition Search Dialog */}
      <CompetitionSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(title, date) => {
          setRaceName(title);
          setRaceDate(date);
          setManualEntry(false);
        }}
      />
    </>
  );
}

function CompetitionSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (title: string, date: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompetitionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("competition")
      .select("id, title, start_date, location")
      .ilike("title", `%${q.trim()}%`)
      .order("start_date", { ascending: false })
      .limit(20);
    setResults(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, search]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>대회 검색</DialogTitle>
          <DialogDescription>대회명을 검색하세요.</DialogDescription>
        </DialogHeader>

        <Input
          placeholder="대회명을 입력하세요..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />

        <div className="-mx-6 h-[300px] overflow-y-auto px-6">
          {loading ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-3 py-2.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-1.5 h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="flex flex-col">
              {results.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => {
                    onSelect(comp.title, comp.start_date);
                    onOpenChange(false);
                  }}
                  className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                >
                  <span className="text-sm font-medium">{comp.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {comp.start_date}
                    {comp.location ? ` · ${comp.location}` : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : !query.trim() ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              대회명을 입력해 주세요.
            </p>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
