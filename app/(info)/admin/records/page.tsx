"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteRecord, updateRecord } from "@/app/actions/admin/manage-record";
import {
  Search,
  Trash2,
  Pencil,
  X,
  Check,
  Timer,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H2 } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardItem } from "@/components/ui/card";
import { secondsToTime as formatTime, timeStringToSeconds as parseTime } from "@/lib/dayjs";

type RaceRecord = {
  id: string;
  event_type: string;
  record_time_sec: number;
  race_name: string | null;
  race_date: string | null;
  member: { mem_nm: string | null } | null;
};

export default function RecordsPage() {
  const [records, setRecords] = useState<RaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRecords = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("rec_race_hist")
      .select(
        "race_result_id, comp_evt_cfg(evt_cd), rec_time_sec, race_nm, race_dt, mem_mst!rec_race_hist_mem_id_fkey(mem_nm)",
      )
      .order("race_dt", { ascending: false })
      .limit(200);
    const mapped = (data ?? []).map((r) => ({
      id: r.race_result_id,
      event_type: (Array.isArray(r.comp_evt_cfg) ? r.comp_evt_cfg[0] : r.comp_evt_cfg)?.evt_cd ?? "UNKNOWN",
      record_time_sec: r.rec_time_sec,
      race_name: r.race_nm,
      race_date: r.race_dt,
      member: { mem_nm: (Array.isArray(r.mem_mst) ? r.mem_mst[0] : r.mem_mst)?.mem_nm ?? null },
    }));
    setRecords(mapped as RaceRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const nameMatch = r.member?.mem_nm?.toLowerCase().includes(q);
    const raceMatch = r.race_name?.toLowerCase().includes(q);
    const typeMatch = r.event_type.toLowerCase().includes(q);
    return nameMatch || raceMatch || typeMatch;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("기록을 삭제하시겠습니까?")) return;
    const result = await deleteRecord(id);
    if (result.ok) {
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert(result.message);
    }
  };

  const startEdit = (record: RaceRecord) => {
    setEditingId(record.id);
    setEditTime(formatTime(record.record_time_sec));
  };

  const handleUpdate = async (record: RaceRecord) => {
    const timeSec = parseTime(editTime);
    if (timeSec === null) {
      alert("시간 형식이 올바르지 않습니다 (H:MM:SS 또는 M:SS)");
      return;
    }
    setSaving(true);
    const result = await updateRecord(record.id, {
      eventType: record.event_type,
      recordTimeSec: timeSec,
      raceName: record.race_name ?? "",
      raceDate: record.race_date ?? "",
    });
    if (result.ok) {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id ? { ...r, record_time_sec: timeSec } : r,
        ),
      );
      setEditingId(null);
    } else {
      alert(result.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-32 rounded" />
        <Skeleton className="h-12 w-full rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>기록 관리</H2>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 대회명, 종목 검색"
          className="h-12 rounded-xl border-[1.5px] pl-10 text-[15px]"
        />
      </div>

      <span className="text-[13px] text-muted-foreground">
        {filtered.length}건
      </span>

      {/* 기록 목록 */}
      <div className="flex flex-col gap-2">
        {filtered.map((record) => (
          <CardItem
            key={record.id}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-foreground">
                  {record.member?.mem_nm ?? "이름 없음"}
                </span>
                <Badge variant="outline" className="text-[11px]">
                  {record.event_type}
                </Badge>
              </div>
              <div className="flex gap-1">
                {editingId === record.id ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditingId(null)}
                      className="text-muted-foreground"
                    >
                      <X className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleUpdate(record)}
                      disabled={saving}
                      className="text-primary"
                    >
                      <Check className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEdit(record)}
                      className="text-muted-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(record.id)}
                      className="text-muted-foreground active:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
              <span>{record.race_name ?? "-"}</span>
              {record.race_date && (
                <span className="text-[11px]">{record.race_date}</span>
              )}
            </div>

            {editingId === record.id ? (
              <Input
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                placeholder="H:MM:SS"
                className="h-10 rounded-lg border-[1.5px] text-[15px] font-mono"
                autoFocus
              />
            ) : (
              <span className="text-lg font-bold tabular-nums text-foreground">
                {formatTime(record.record_time_sec)}
              </span>
            )}
          </CardItem>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Timer className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">기록이 없습니다</p>
        </div>
      )}
    </div>
  );
}
