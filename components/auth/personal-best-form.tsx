"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const EVENT_TYPES = [
  { value: "5K", label: "5K" },
  { value: "10K", label: "10K" },
  { value: "HALF", label: "하프마라톤" },
  { value: "FULL", label: "풀마라톤" },
  { value: "TRIATHLON", label: "철인3종" },
] as const;

type EventType = (typeof EVENT_TYPES)[number]["value"];

type PersonalBestRecord = {
  event_type: EventType;
  record_time_sec: number;
  race_name: string;
  race_date: string;
};

type PersonalBestFormProps = {
  memberId: string;
  initialRecords: PersonalBestRecord[];
};

type CompetitionRow = {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
};

function secondsToTimeString(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function timeStringToSeconds(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

// ─── Competition Search Dialog ───────────────────────────────────────────────

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
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [results, setResults] = useState<CompetitionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"search" | "calendar">("search");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchByName = useCallback(async (q: string) => {
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

  const searchByMonth = useCallback(
    async (year: number, month: number) => {
      setLoading(true);
      const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const endStr = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const supabase = createClient();
      const { data } = await supabase
        .from("competition")
        .select("id, title, start_date, location")
        .gte("start_date", startStr)
        .lt("start_date", endStr)
        .order("start_date", { ascending: true });
      setResults(data ?? []);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "search") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => searchByName(query), 300);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
  }, [query, open, mode, searchByName]);

  useEffect(() => {
    if (!open) return;
    if (mode === "calendar") {
      searchByMonth(monthDate.year, monthDate.month);
    }
  }, [monthDate, open, mode, searchByMonth]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setMode("search");
    }
  }, [open]);

  const prevMonth = () => {
    setMonthDate((prev) => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { ...prev, month: prev.month - 1 };
    });
  };
  const nextMonth = () => {
    setMonthDate((prev) => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { ...prev, month: prev.month + 1 };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>대회 검색</DialogTitle>
          <DialogDescription>
            이름으로 검색하거나 월별로 찾아보세요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("search")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "search"
                ? "bg-foreground text-background"
                : "bg-black/5 text-foreground/70 hover:bg-black/10"
            }`}
          >
            이름 검색
          </button>
          <button
            type="button"
            onClick={() => setMode("calendar")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "calendar"
                ? "bg-foreground text-background"
                : "bg-black/5 text-foreground/70 hover:bg-black/10"
            }`}
          >
            월별 검색
          </button>
        </div>

        {mode === "search" ? (
          <Input
            placeholder="대회명을 입력하세요..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        ) : (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-md px-3 py-1.5 text-sm hover:bg-black/5"
            >
              &larr;
            </button>
            <span className="text-sm font-medium">
              {formatMonthLabel(monthDate.year, monthDate.month)}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-md px-3 py-1.5 text-sm hover:bg-black/5"
            >
              &rarr;
            </button>
          </div>
        )}

        <div className="h-[300px] overflow-y-auto -mx-6 px-6">
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
                  className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-black/5 transition-colors"
                >
                  <span className="text-sm font-medium">{comp.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {comp.start_date}
                    {comp.location ? ` · ${comp.location}` : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : mode === "search" && !query.trim() ? (
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

// ─── Main Form ───────────────────────────────────────────────────────────────

export function PersonalBestForm({
  memberId,
  initialRecords,
}: PersonalBestFormProps) {
  const [selectedEvent, setSelectedEvent] = useState<EventType>("5K");
  const [records, setRecords] =
    useState<PersonalBestRecord[]>(initialRecords);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const [timeInput, setTimeInput] = useState("");
  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);

  const currentRecord = records.find((r) => r.event_type === selectedEvent);

  const handleEventChange = (eventType: EventType) => {
    setSelectedEvent(eventType);
    setSaveState("idle");
    setMessage(null);
    setManualEntry(false);

    const existing = records.find((r) => r.event_type === eventType);
    if (existing) {
      setTimeInput(secondsToTimeString(existing.record_time_sec));
      setRaceName(existing.race_name);
      setRaceDate(existing.race_date);
    } else {
      setTimeInput("");
      setRaceName("");
      setRaceDate("");
    }
  };

  const handleCompetitionSelect = (title: string, date: string) => {
    setRaceName(title);
    setRaceDate(date);
    setManualEntry(false);
  };

  const handleSave = async () => {
    setSaveState("saving");
    setMessage(null);

    if (!raceName.trim()) {
      setSaveState("error");
      setMessage("대회를 선택하거나 입력해 주세요.");
      return;
    }
    if (!raceDate) {
      setSaveState("error");
      setMessage("대회 날짜를 입력해 주세요.");
      return;
    }

    const record_time_sec = timeStringToSeconds(timeInput);
    if (!record_time_sec || record_time_sec <= 0) {
      setSaveState("error");
      setMessage("기록을 MM:SS 또는 HH:MM:SS 형식으로 입력해 주세요.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("personal_best").upsert(
      {
        member_id: memberId,
        event_type: selectedEvent,
        record_time_sec,
        race_name: raceName.trim(),
        race_date: raceDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id,event_type" },
    );

    if (error) {
      setSaveState("error");
      setMessage(error.message);
      return;
    }

    setRecords((prev) => {
      const next = prev.filter((r) => r.event_type !== selectedEvent);
      next.push({
        event_type: selectedEvent,
        record_time_sec,
        race_name: raceName.trim(),
        race_date: raceDate,
      });
      return next;
    });

    setSaveState("success");
    setMessage("저장 완료");
  };

  const handleDelete = async () => {
    if (!currentRecord) return;

    setSaveState("saving");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("personal_best")
      .delete()
      .eq("member_id", memberId)
      .eq("event_type", selectedEvent);

    if (error) {
      setSaveState("error");
      setMessage(error.message);
      return;
    }

    setRecords((prev) => prev.filter((r) => r.event_type !== selectedEvent));
    setTimeInput("");
    setRaceName("");
    setRaceDate("");
    setSaveState("success");
    setMessage("삭제 완료");
  };

  return (
    <>
      <Card className="border border-border bg-white text-foreground shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">최고기록 (PB)</CardTitle>
          <CardDescription>
            종목별 개인 최고기록을 관리하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((evt) => {
                const hasRecord = records.some(
                  (r) => r.event_type === evt.value,
                );
                return (
                  <button
                    key={evt.value}
                    type="button"
                    onClick={() => handleEventChange(evt.value)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedEvent === evt.value
                        ? "bg-foreground text-background"
                        : hasRecord
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : "bg-black/5 text-foreground/70 hover:bg-black/10"
                    }`}
                  >
                    {evt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <Label>기록 (MM:SS 또는 HH:MM:SS)</Label>
                <Input
                  placeholder="예: 23:45 또는 1:45:30"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                />
              </div>

              <div>
                <Label>대회</Label>
                {raceName && !manualEntry ? (
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border bg-white/50 px-3 py-2 text-sm">
                      <span className="truncate font-medium">{raceName}</span>
                      <span className="text-xs text-muted-foreground">
                        {raceDate}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchOpen(true)}
                    >
                      변경
                    </Button>
                  </div>
                ) : manualEntry ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder="대회명"
                      value={raceName}
                      onChange={(e) => setRaceName(e.target.value)}
                    />
                    <Input
                      type="date"
                      value={raceDate}
                      onChange={(e) => setRaceDate(e.target.value)}
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSearchOpen(true)}
                      className="justify-start text-muted-foreground font-normal"
                    >
                      대회를 검색하세요...
                    </Button>
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
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="flex-1"
              >
                {saveState === "saving" ? "저장 중..." : "저장"}
              </Button>
              {currentRecord && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={saveState === "saving"}
                >
                  삭제
                </Button>
              )}
            </div>
            {message ? (
              <p
                className={
                  saveState === "error"
                    ? "text-sm text-red-500"
                    : "text-sm text-emerald-600"
                }
              >
                {message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <CompetitionSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={handleCompetitionSelect}
      />
    </>
  );
}
