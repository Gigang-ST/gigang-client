"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchUtmbIndex } from "@/app/actions/utmb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { secondsToTime } from "@/lib/dayjs";

type BestRecord = {
  record_time_sec: number;
  race_name: string;
};

type UtmbData = {
  utmb_profile_url: string;
  utmb_index: number;
  recent_race_name?: string | null;
  recent_race_record?: string | null;
} | null;

type Props = {
  bestRecords: Record<string, BestRecord>;
  utmbData: UtmbData;
  memberId: string;
};

const PB_EVENTS = ["FULL", "HALF", "10K"] as const;

export function PersonalBestGrid({ bestRecords, utmbData, memberId }: Props) {
  const [utmb, setUtmb] = useState(utmbData);
  const [utmbOpen, setUtmbOpen] = useState(false);

  // UTMB dialog form state
  const [utmbUrl, setUtmbUrl] = useState("");
  const [utmbIndex, setUtmbIndex] = useState<number | null>(null);
  const [utmbName, setUtmbName] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const toShortId = (url: string) => {
    const match = url.match(/\/runner\/(.+)$/);
    return match ? match[1] : url;
  };

  // 최근 대회 폼 state
  const [recentRaceName, setRecentRaceName] = useState("");
  const [recentRaceRecord, setRecentRaceRecord] = useState("");

  const resetUtmbForm = () => {
    setUtmbUrl(utmb?.utmb_profile_url ? toShortId(utmb.utmb_profile_url) : "");
    setUtmbIndex(utmb?.utmb_index ?? null);
    setUtmbName("");
    setRecentRaceName(utmb?.recent_race_name ?? "");
    setRecentRaceRecord(utmb?.recent_race_record ?? "");
    setMessage(null);
    setIsError(false);
  };

  const handleUtmbOpenChange = (v: boolean) => {
    setUtmbOpen(v);
    if (v) resetUtmbForm();
  };

  const handleFetch = async () => {
    if (!utmbUrl.trim()) {
      setMessage("번호와 이름을 입력해 주세요.");
      setIsError(true);
      return;
    }
    setFetching(true);
    setMessage(null);
    const fullUrl = utmbUrl.trim().startsWith("http")
      ? utmbUrl.trim()
      : `https://utmb.world/en/runner/${utmbUrl.trim()}`;
    const result = await fetchUtmbIndex(fullUrl);
    setFetching(false);
    if (result.ok) {
      setUtmbIndex(result.index);
      setUtmbName(result.name);
      if (result.recentRaceName) setRecentRaceName(result.recentRaceName);
      if (result.recentRaceRecord) setRecentRaceRecord(result.recentRaceRecord);
      setMessage(null);
      setIsError(false);
    } else {
      setUtmbIndex(null);
      setUtmbName("");
      setMessage(result.error);
      setIsError(true);
    }
  };

  const handleSave = async () => {
    if (!utmbUrl.trim()) {
      setMessage("번호와 이름을 입력해 주세요.");
      setIsError(true);
      return;
    }
    if (utmbIndex === null) {
      setMessage("먼저 '조회' 버튼으로 UTMB Index를 가져와 주세요.");
      setIsError(true);
      return;
    }
    setSaving(true);
    setMessage(null);
    const fullUrl = utmbUrl.trim().startsWith("http")
      ? utmbUrl.trim()
      : `https://utmb.world/en/runner/${utmbUrl.trim()}`;
    const supabase = createClient();
    const { error } = await supabase.from("mem_utmb_prf").upsert(
      {
        mem_id: memberId,
        utmb_prf_url: fullUrl,
        utmb_idx: utmbIndex,
        rct_race_nm: recentRaceName.trim() || null,
        rct_race_rec: recentRaceRecord.trim() || null,
        vers: 0,
        del_yn: false,
      },
      { onConflict: "mem_id,vers" },
    );
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }
    setUtmb({
      utmb_profile_url: fullUrl,
      utmb_index: utmbIndex,
      recent_race_name: recentRaceName.trim() || null,
      recent_race_record: recentRaceRecord.trim() || null,
    });
    setUtmbOpen(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("UTMB Index 정보를 삭제하시겠습니까?")) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("mem_utmb_prf")
      .delete()
      .eq("mem_id", memberId)
      .eq("vers", 0);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }
    setUtmb(null);
    setUtmbOpen(false);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {/* FULL / HALF / 10K cards (read-only) */}
        {PB_EVENTS.map((evt, i) => {
          const pb = bestRecords[evt];
          return (
            <div
              key={evt}
              className={`flex min-w-0 flex-col gap-1 rounded-xl p-4 ${i < 2 ? "border-[1.5px] border-border" : "bg-secondary"}`}
            >
              <span className="text-xs font-semibold text-primary">
                {evt}
              </span>
              <span className="font-mono text-xl font-bold text-foreground">
                {pb ? secondsToTime(pb.record_time_sec) : "--:--"}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {pb?.race_name ?? ""}
              </span>
            </div>
          );
        })}

        {/* UTMB card (clickable) */}
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleUtmbOpenChange(true)}
          className="h-auto min-w-0 flex-col items-start gap-1 rounded-xl p-4 active:scale-[0.98]"
        >
          <span className="text-xs font-semibold text-primary">UTMB</span>
          <span className="font-mono text-xl font-bold text-foreground">
            {utmb ? utmb.utmb_index : "--"}
          </span>
          <span className="w-full truncate text-[11px] text-muted-foreground">
            {utmb?.recent_race_name ? utmb.recent_race_name : utmb ? "" : "탭하여 연동"}
          </span>
        </Button>
      </div>

      {/* UTMB Dialog */}
      <Dialog open={utmbOpen} onOpenChange={handleUtmbOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>UTMB Index</DialogTitle>
            <DialogDescription>
              UTMB 프로필 번호와 이름을 입력하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  placeholder="123456.gildong.hong"
                  value={utmbUrl}
                  onChange={(e) => {
                    setUtmbUrl(e.target.value);
                    setUtmbIndex(null);
                    setUtmbName("");
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFetch}
                  disabled={fetching}
                  className="shrink-0 border-[1.5px]"
                >
                  {fetching ? "조회 중..." : utmb ? "새로고침" : "조회"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                utmb.world 프로필의 번호.이름 형식으로 입력하세요.
              </p>
              {utmbIndex === null && (
                <a
                  href="https://utmb.world/utmb-index/runner-search"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary underline"
                >
                  내 UTMB 프로필 찾기
                </a>
              )}
            </div>

            {utmbIndex !== null && (
              <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-border p-4">
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {utmbIndex}
                    </span>
                    {utmbName && (
                      <span className="text-sm text-muted-foreground">
                        {utmbName}
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://utmb.world/en/runner/${utmbUrl.trim()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline"
                  >
                    프로필 보기
                  </a>
                </div>
                {recentRaceName && (
                  <div className="flex flex-col gap-0.5 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">최근 대회</span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {recentRaceName}
                    </span>
                    {recentRaceRecord && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {recentRaceRecord}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {message && (
              <p
                className={
                  isError
                    ? "text-sm text-destructive"
                    : "text-sm text-success"
                }
              >
                {message}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-12 flex-1 rounded-xl font-semibold"
              >
                {saving ? "저장 중..." : "저장"}
              </Button>
              {utmb && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={saving}
                  className="h-12 rounded-xl border-[1.5px] px-4 text-destructive hover:text-destructive"
                >
                  삭제
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
