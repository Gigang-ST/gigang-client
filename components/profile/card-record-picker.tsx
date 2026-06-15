"use client";

import { useEffect, useMemo, useState } from "react";

import { secondsToTime } from "@/lib/dayjs";
import {
  cardFeaturedKey,
  isUtmbFeatured,
  resolveCardRecords,
  sportLabel,
  SPORT_DOT_CLASS,
  UTMB_FEATURED_KEY,
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
  utmbIndex,
  open,
  onOpenChange,
  onSaved,
}: {
  allRecords: CardBestRecord[];
  featured: CardFeaturedKey[] | null;
  utmbIndex: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (next: CardFeaturedKey[] | null) => void;
}) {
  const utmbKey = cardFeaturedKey(UTMB_FEATURED_KEY);

  // 현재 선택 키 집합 (featured null → 전체 선택으로 간주). UTMB 인덱스 보유 시 포함.
  const initialKeys = useMemo(() => {
    const resolved = resolveCardRecords(allRecords, featured);
    const keys = new Set(resolved.map(cardFeaturedKey));
    if (isUtmbFeatured(utmbIndex, featured)) keys.add(utmbKey);
    return keys;
  }, [allRecords, featured, utmbIndex, utmbKey]);

  const [selected, setSelected] = useState<Set<string>>(initialKeys);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(initialKeys);
  }, [open, initialKeys]);

  const toggleKey = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggle = (r: CardBestRecord) => toggleKey(cardFeaturedKey(r));

  // 선택 가능한 총 항목 수(기록 + UTMB)
  const totalSelectable = allRecords.length + (utmbIndex != null ? 1 : 0);
  const hasNothing = totalSelectable === 0;

  const handleSave = async () => {
    setSaving(true);
    // 전부 선택이면 null(기본값) 로 저장, 아니면 선택 항목 배열
    const allSelected = selected.size === totalSelectable;
    let next: CardFeaturedKey[] | null;
    if (allSelected) {
      next = null;
    } else {
      next = allRecords
        .filter((r) => selected.has(cardFeaturedKey(r)))
        .map((r) => ({ sport: r.sport, evt: r.evt }));
      if (utmbIndex != null && selected.has(utmbKey)) {
        next.push({ ...UTMB_FEATURED_KEY });
      }
    }
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
          {hasNothing ? (
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
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${sportLabel(sport)} ${r.evt}`}
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

          {/* UTMB 인덱스 (트레일) — 보유 시 선택 가능 */}
          {utmbIndex != null && (
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("inline-block size-2 rounded-full", SPORT_DOT_CLASS.trail_run)} />
                트레일 UTMB
              </span>
              {(() => {
                const on = selected.has(utmbKey);
                return (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label="트레일 UTMB 인덱스"
                    onClick={() => toggleKey(utmbKey)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                      on ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn("flex size-4 items-center justify-center rounded border-[1.5px]", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground")}>
                        {on ? "✓" : ""}
                      </span>
                      UTMB 인덱스
                    </span>
                    <span className="font-mono font-bold text-foreground">{utmbIndex}</span>
                  </button>
                );
              })()}
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving || hasNothing || selected.size === 0} className="h-11 rounded-xl font-semibold">
          {saving ? "저장 중..." : "저장"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
