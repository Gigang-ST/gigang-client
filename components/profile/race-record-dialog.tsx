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
import { cn } from "@/lib/utils";

/* ---------- 시간 유틸리티 ---------- */

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

function secondsToTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---------- 타입 ---------- */

interface Competition {
  id: string;
  title: string;
  start_date: string;
  location: string;
  sport: string;
  event_types: string[];
}

const TRIATHLON_COURSES = ["SPRINT", "OLYMPIC", "HALF", "FULL"] as const;
const DEFAULT_COURSES = ["FULL", "HALF", "10K"] as const;

const SPORT_OPTIONS = [
  { key: "running", label: "러닝" },
  { key: "cycling", label: "자전거" },
  { key: "swimming", label: "수영" },
  { key: "triathlon", label: "트라이애슬론" },
  { key: "trail_running", label: "트레일러닝" },
];

/* ---------- 컴포넌트 ---------- */

export function RaceRecordDialog({
  memberId,
  open,
  onOpenChange,
  onSaved,
}: {
  memberId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  // 단계 관리
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // 대회 목록
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);

  // 선택된 대회
  const [selectedComp, setSelectedComp] = useState<Competition | null>(null);

  // 직접 입력 모드
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualSport, setManualSport] = useState("");
  const [manualEventType, setManualEventType] = useState("");

  // 코스/이벤트 선택
  const [selectedEventType, setSelectedEventType] = useState("");
  const [customEventType, setCustomEventType] = useState("");

  // 기록 입력
  const [totalTime, setTotalTime] = useState("");
  const [swimTime, setSwimTime] = useState("");
  const [bikeTime, setBikeTime] = useState("");
  const [runTime, setRunTime] = useState("");

  // 저장 상태
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 트라이애슬론 여부
  const isTriathlon = manualMode
    ? manualSport.includes("triathlon")
    : (selectedComp?.sport ?? "").includes("triathlon");

  // 트랜지션 자동 계산
  const transitionSeconds = useMemo(() => {
    if (!isTriathlon) return null;
    const total = timeStringToSeconds(totalTime);
    const swim = timeStringToSeconds(swimTime);
    const bike = timeStringToSeconds(bikeTime);
    const run = timeStringToSeconds(runTime);
    if (total == null || swim == null || bike == null || run == null)
      return null;
    return total - swim - bike - run;
  }, [isTriathlon, totalTime, swimTime, bikeTime, runTime]);

  // 다이얼로그 열릴 때 초기화 + 대회 목록 불러오기
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedComp(null);
      setManualMode(false);
      setManualName("");
      setManualDate("");
      setManualSport("");
      setManualEventType("");
      setSelectedEventType("");
      setCustomEventType("");
      setTotalTime("");
      setSwimTime("");
      setBikeTime("");
      setRunTime("");
      setError(null);
      fetchCompetitions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function fetchCompetitions() {
    setLoadingComps(true);
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    const { data } = await supabase
      .from("competition")
      .select("id, title, start_date, location, sport, event_types, competition_registration!inner(id)")
      .gte("start_date", oneMonthAgo.toISOString().split("T")[0])
      .lte("start_date", today.toISOString().split("T")[0])
      .order("start_date", { ascending: false })
      .limit(30);

    // competition_registration 필드 제거 + 중복 제거
    const seen = new Set<string>();
    const unique = (data ?? [])
      .map(({ competition_registration, ...rest }) => rest as Competition)
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

    setCompetitions(unique);
    setLoadingComps(false);
  }

  // 대회 선택
  function handleSelectCompetition(comp: Competition) {
    setSelectedComp(comp);
    setManualMode(false);
    setSelectedEventType("");
    setStep(2);
  }

  // 직접 입력 모드 전환
  function handleManualMode() {
    setManualMode(true);
    setSelectedComp(null);
    setSelectedEventType("");
    setStep(2);
  }

  // 코스 선택
  function handleSelectEventType(eventType: string) {
    setSelectedEventType(eventType);
    setTotalTime("");
    setSwimTime("");
    setBikeTime("");
    setRunTime("");
    setError(null);
    setStep(3);
  }

  // 뒤로가기
  function handleBack() {
    setError(null);
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setManualMode(false);
      setSelectedComp(null);
      setStep(1);
    }
  }

  // 대회 정보 (선택 or 직접입력)
  const competitionTitle = manualMode
    ? manualName.trim()
    : (selectedComp?.title ?? "");
  const competitionDate = manualMode
    ? manualDate
    : (selectedComp?.start_date ?? "");
  const eventType = manualMode
    ? manualEventType.trim()
    : selectedEventType === "CUSTOM"
      ? customEventType.trim()
      : selectedEventType;

  // 저장 가능 여부
  const canSave = (() => {
    if (!competitionTitle || !competitionDate || !eventType) return false;
    if (!timeStringToSeconds(totalTime)) return false;
    if (isTriathlon) {
      if (
        !timeStringToSeconds(swimTime) ||
        !timeStringToSeconds(bikeTime) ||
        !timeStringToSeconds(runTime)
      )
        return false;
    }
    return true;
  })();

  async function handleSave() {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);

    const totalSeconds = timeStringToSeconds(totalTime)!;
    const swimSeconds = isTriathlon ? timeStringToSeconds(swimTime) : null;
    const bikeSeconds = isTriathlon ? timeStringToSeconds(bikeTime) : null;
    const runSeconds = isTriathlon ? timeStringToSeconds(runTime) : null;

    const finalEventType = isTriathlon
      ? `TRIATHLON_${eventType}`
      : eventType;

    const { error: insertError } = await supabase
      .from("race_result")
      .insert({
        member_id: memberId,
        event_type: finalEventType,
        record_time_sec: totalSeconds,
        race_name: competitionTitle,
        race_date: competitionDate,
        swim_time_sec: swimSeconds,
        bike_time_sec: bikeSeconds,
        run_time_sec: runSeconds,
      });

    setIsSaving(false);

    if (insertError) {
      setError("저장에 실패했습니다. 다시 시도해주세요.");
      return;
    }

    onSaved();
    onOpenChange(false);
  }

  /* ---------- 렌더링 ---------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>기록 입력</DialogTitle>
          <DialogDescription>
            {step === 1 && "대회를 선택해주세요"}
            {step === 2 && "코스를 선택해주세요"}
            {step === 3 && "기록을 입력해주세요"}
          </DialogDescription>
        </DialogHeader>

        {step > 1 && (
          <button
            type="button"
            onClick={handleBack}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; 뒤로
          </button>
        )}

        {/* 단계 1: 대회 선택 */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            {loadingComps ? (
              <p className="text-sm text-muted-foreground">
                대회 목록 불러오는 중...
              </p>
            ) : competitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                최근 1개월 내 대회가 없습니다
              </p>
            ) : (
              competitions.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => handleSelectCompetition(comp)}
                  className="rounded-lg px-4 py-3 border-[1.5px] border-border text-left transition-colors hover:border-primary/50"
                >
                  <p className="text-sm font-medium">{comp.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {comp.start_date} &middot; {comp.location}
                  </p>
                </button>
              ))
            )}

            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={handleManualMode}
                className="h-[48px] w-full rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
              >
                직접 입력
              </button>
            </div>
          </div>
        )}

        {/* 단계 2: 코스 선택 */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {manualMode ? (
              /* 직접 입력 모드 */
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">대회명</label>
                  <Input
                    placeholder="예: 2026 서울마라톤"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">대회 날짜</label>
                  <Input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">종목</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SPORT_OPTIONS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setManualSport(s.key)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          manualSport === s.key
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">코스/이벤트</label>
                  {manualSport.includes("triathlon") ? (
                    <div className="flex flex-wrap gap-1.5">
                      {TRIATHLON_COURSES.map((course) => (
                        <button
                          key={course}
                          type="button"
                          onClick={() => setManualEventType(course)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            manualEventType === course
                              ? "bg-foreground text-background border-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50",
                          )}
                        >
                          {course}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      placeholder="예: FULL, HALF, 10K"
                      value={manualEventType}
                      onChange={(e) => setManualEventType(e.target.value)}
                    />
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    !manualName.trim() ||
                    !manualDate ||
                    !manualSport ||
                    !manualEventType.trim()
                  }
                  onClick={() => {
                    setTotalTime("");
                    setSwimTime("");
                    setBikeTime("");
                    setRunTime("");
                    setError(null);
                    setStep(3);
                  }}
                  className="h-[48px] w-full rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            ) : (
              /* 대회 선택 모드 - 코스 pill 표시 */
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">{selectedComp?.title}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedComp?.start_date} &middot;{" "}
                  {selectedComp?.location}
                </p>

                {isTriathlon ? (
                  <div className="flex flex-wrap gap-1.5">
                    {TRIATHLON_COURSES.map((course) => (
                      <button
                        key={course}
                        type="button"
                        onClick={() => handleSelectEventType(course)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selectedEventType === course
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {course}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_COURSES.map((course) => (
                        <button
                          key={course}
                          type="button"
                          onClick={() => {
                            setCustomEventType("");
                            handleSelectEventType(course);
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            selectedEventType === course
                              ? "bg-foreground text-background border-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50",
                          )}
                        >
                          {course}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEventType("CUSTOM");
                          setCustomEventType("");
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selectedEventType === "CUSTOM"
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        기타
                      </button>
                    </div>
                    {selectedEventType === "CUSTOM" && (
                      <div className="flex flex-col gap-1.5">
                        <Input
                          placeholder="예: 5K, 100K 등"
                          value={customEventType}
                          onChange={(e) => setCustomEventType(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={!customEventType.trim()}
                          onClick={() => {
                            setTotalTime("");
                            setError(null);
                            setStep(3);
                          }}
                          className="h-[48px] w-full rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
                        >
                          다음
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 단계 3: 기록 입력 */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-sm font-medium">{competitionTitle}</p>
              <p className="text-xs text-muted-foreground">
                {competitionDate} &middot; {eventType}
              </p>
            </div>

            {isTriathlon ? (
              /* 트라이애슬론: 세부 시간 입력 */
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">대회 총 시간</label>
                  <Input
                    placeholder="HH:MM:SS"
                    value={totalTime}
                    onChange={(e) => setTotalTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">수영</label>
                  <Input
                    placeholder="HH:MM:SS"
                    value={swimTime}
                    onChange={(e) => setSwimTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">자전거</label>
                  <Input
                    placeholder="HH:MM:SS"
                    value={bikeTime}
                    onChange={(e) => setBikeTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">러닝</label>
                  <Input
                    placeholder="HH:MM:SS"
                    value={runTime}
                    onChange={(e) => setRunTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">트랜지션</label>
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
                    {transitionSeconds != null
                      ? transitionSeconds < 0
                        ? "계산 오류"
                        : secondsToTime(transitionSeconds)
                      : "-"}
                  </div>
                  {transitionSeconds != null && transitionSeconds < 0 && (
                    <p className="text-xs text-destructive">
                      트랜지션이 음수입니다. 시간을 다시 확인해주세요.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* 일반 종목: 단일 시간 입력 */
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">완주 시간</label>
                <Input
                  placeholder="HH:MM:SS"
                  value={totalTime}
                  onChange={(e) => setTotalTime(e.target.value)}
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <button
              type="button"
              disabled={!canSave || isSaving}
              onClick={handleSave}
              className="h-[48px] w-full rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "기록 저장"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
