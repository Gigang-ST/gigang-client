"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveSportConfig, SPORT_LEGEND } from "./sport-config";
import type { MemberStatus } from "./types";

const SPORT_OPTIONS = SPORT_LEGEND.filter(s => s.key !== "other");

interface CompetitionRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberStatus: MemberStatus;
  onCreated: () => void;
}

export function CompetitionRegisterDialog({
  open,
  onOpenChange,
  memberStatus,
  onCreated,
}: CompetitionRegisterDialogProps) {
  const supabase = useMemo(() => createClient(), []);

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 종목 변경 시 코스 선택 초기화
  const eventTypeOptions = useMemo(() => {
    return resolveSportConfig(sport || null).eventTypes;
  }, [sport]);

  useEffect(() => {
    setSelectedEventTypes([]);
  }, [sport]);

  // 다이얼로그 열릴 때 폼 초기화
  useEffect(() => {
    if (open) {
      setTitle("");
      setSport("");
      setStartDate("");
      setEndDate("");
      setLocation("");
      setSourceUrl("");
      setSelectedEventTypes([]);
      setError(null);
    }
  }, [open]);

  const toggleEventType = (type: string) => {
    setSelectedEventTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
    );
  };

  const canSubmit =
    title.trim() &&
    sport &&
    startDate &&
    location.trim() &&
    selectedEventTypes.length > 0 &&
    sourceUrl.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    if (endDate && endDate < startDate) {
      setError("종료일은 시작일 이후여야 합니다.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from("competition").insert({
      external_id: `manual:${crypto.randomUUID()}`,
      sport,
      title: title.trim(),
      start_date: startDate,
      end_date: endDate || null,
      location: location.trim(),
      event_types: selectedEventTypes,
      source_url: sourceUrl.trim(),
    });

    setIsSaving(false);

    if (insertError) {
      setError("등록에 실패했습니다. 다시 시도해주세요.");
      return;
    }

    onCreated();
    onOpenChange(false);
  }

  const showAuthMessage = memberStatus.status !== "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>대회 등록</DialogTitle>
          <DialogDescription>
            크롤링되지 않은 대회를 직접 등록합니다
          </DialogDescription>
        </DialogHeader>

        {showAuthMessage ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>로그인 후 대회를 등록할 수 있습니다.</p>
            <Button asChild className="w-full">
              <Link href="/auth/login?next=%2Fraces">로그인</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-title">대회명 *</Label>
              <Input
                id="comp-title"
                placeholder="예: 2026 서울마라톤"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-sport">종목 *</Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger id="comp-sport">
                  <SelectValue placeholder="종목 선택" />
                </SelectTrigger>
                <SelectContent>
                  {SPORT_OPTIONS.map(s => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-start">시작일 *</Label>
              <Input
                id="comp-start"
                type="date"
                max="9999-12-31"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-end">종료일</Label>
              <Input
                id="comp-end"
                type="date"
                max="9999-12-31"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-location">장소 *</Label>
              <Input
                id="comp-location"
                placeholder="예: 서울 여의도"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>참가 코스 * {selectedEventTypes.length > 0 && `(${selectedEventTypes.length}개 선택)`}</Label>
              {eventTypeOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {eventTypeOptions.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleEventType(type)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedEventTypes.includes(type)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">종목을 먼저 선택해주세요</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-url">대회 링크 *</Label>
              <Input
                id="comp-url"
                type="url"
                placeholder="https://..."
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={!canSubmit || isSaving} className="w-full">
                {isSaving ? "등록 중..." : "대회 등록"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
