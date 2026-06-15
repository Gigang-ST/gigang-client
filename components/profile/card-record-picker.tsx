"use client";

import { useMemo, useState } from "react";

import { secondsToTime } from "@/lib/dayjs";
import {
  cardFeaturedKey,
  resolveCardRecords,
  sportLabel,
  SPORT_DOT_CLASS,
  type CardBestRecord,
  type CardFeaturedKey,
} from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { saveCardFeatured } from "@/app/actions/save-card-featured";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CardRecordPicker({
  allRecords,
  featured,
  open,
  onOpenChange,
  onSaved,
}: {
  allRecords: CardBestRecord[];
  featured: CardFeaturedKey[] | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (next: CardFeaturedKey[] | null) => void;
}) {
  // 현재 선택 키 집합 (featured null → 전체 선택으로 간주)
  const initialKeys = useMemo(() => {
    const resolved = resolveCardRecords(allRecords, featured);
    return new Set(resolved.map(cardFeaturedKey));
  }, [allRecords, featured]);

  const [selected, setSelected] = useState<Set<string>>(initialKeys);
  const [saving, setSaving] = useState(false);

  const toggle = (r: CardBestRecord) => {
    const key = cardFeaturedKey(r);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // 전부 선택이면 null(기본값) 로 저장, 아니면 선택 항목 배열
    const allSelected = selected.size === allRecords.length;
    const next: CardFeaturedKey[] | null = allSelected
      ? null
      : allRecords
          .filter((r) => selected.has(cardFeaturedKey(r)))
          .map((r) => ({ sport: r.sport, evt: r.evt }));
    const result = await saveCardFeatured(next);
    setSaving(false);
    if (result.ok) {
      onSaved(next);
      onOpenChange(false);
    }
  };

  // 종목별 그룹
  const groups = useMemo(() => {
    const map = new Map<string, CardBestRecord[]>();
    for (const r of allRecords) {
      const arr = map.get(r.sport) ?? [];
      arr.push(r);
      map.set(r.sport, arr);
    }
    return [...map.entries()];
  }, [allRecords]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>카드에 넣을 기록 선택</DialogTitle>
          <DialogDescription>보여줄 기록만 골라요. 고른 만큼 모두 표시됩니다.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
          {allRecords.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              등록된 기록이 없습니다.
            </p>
          ) : (
            groups.map(([sport, rows]) => (
              <div key={sport} className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("inline-block size-2 rounded-full", SPORT_DOT_CLASS[sport] ?? "bg-muted-foreground")} />
                  {sportLabel(sport)}
                </span>
                {rows.map((r) => {
                  const key = cardFeaturedKey(r);
                  const on = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(r)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                        on ? "border-primary bg-primary/10" : "border-border",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn("flex size-4 items-center justify-center rounded border-[1.5px]", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground")}>
                          {on ? "✓" : ""}
                        </span>
                        {r.evt}
                      </span>
                      <span className="font-mono font-bold text-foreground">{secondsToTime(r.rec_time_sec)}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <Button onClick={handleSave} disabled={saving || allRecords.length === 0} className="h-11 rounded-xl font-semibold">
          {saving ? "저장 중..." : "저장"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
