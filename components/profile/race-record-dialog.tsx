"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { timeStringToSeconds, secondsToTime } from "@/lib/dayjs";
import { resolveSportConfig } from "@/components/races/sport-config";
import { searchCompetitions } from "@/app/actions/search-competitions";

/** 기타(직접 입력) 선택 시 사용 */
const EVENT_TYPE_OTHER = "__OTHER__";

/* ---------- 타입 ---------- */

interface Competition {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
  sport: string;
  event_types: string[] | null;
  /** 참가 신청 시 선택한 종목 (참가한 대회 목록에서만 있음, 검색 결과에는 없음) */
  registeredEventType?: string | null;
}

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

  // 전체 대회 검색 (자동완성)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Competition[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

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

  // 트라이애슬론 여부 (step 3 시간 입력용)
  const isTriathlon = (selectedComp?.sport ?? "").includes("triathlon");

  // 코스/종목 옵션: 검색으로 선택한 대회용. 대회 event_types 있으면 그 목록, 없으면 sport-config 기본 + 기타(직접 입력)
  const eventTypeOptions = useMemo(() => {
    if (!selectedComp) return [];
    const types = selectedComp.event_types;
    const list =
      types != null && types.length > 0
        ? types.map((t) => String(t).toUpperCase())
        : resolveSportConfig(selectedComp.sport).eventTypes;
    return [...list, EVENT_TYPE_OTHER];
  }, [selectedComp?.id, selectedComp?.event_types, selectedComp?.sport]);

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
      setSearchQuery("");
      setSearchResults([]);
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
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(today.getMonth() - 3);

    const { data } = await supabase
      .from("comp_reg_rel")
      .select("comp_reg_id, comp_evt_cfg(evt_cd), team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm, comp_sprt_cd, comp_evt_cfg(evt_cd)))")
      .eq("mem_id", memberId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("team_comp_plan_rel.comp_mst.stt_dt", threeMonthsAgo.toISOString().split("T")[0])
      .lte("team_comp_plan_rel.comp_mst.stt_dt", today.toISOString().split("T")[0])
      .order("crt_at", { ascending: false })
      .limit(50);

    const seen = new Set<string>();
    const raw = data ?? [];
    type Row = (typeof raw)[number];
    const unique = (raw as Row[])
      .map((row) => {
        const rowAny = row as unknown as {
          team_comp_plan_rel: { comp_mst: { comp_id: string; comp_nm: string; stt_dt: string; loc_nm: string | null; comp_sprt_cd: string; comp_evt_cfg?: { evt_cd: string }[] }[] | { comp_id: string; comp_nm: string; stt_dt: string; loc_nm: string | null; comp_sprt_cd: string; comp_evt_cfg?: { evt_cd: string }[] } }[] | { comp_mst: { comp_id: string; comp_nm: string; stt_dt: string; loc_nm: string | null; comp_sprt_cd: string; comp_evt_cfg?: { evt_cd: string }[] }[] | { comp_id: string; comp_nm: string; stt_dt: string; loc_nm: string | null; comp_sprt_cd: string; comp_evt_cfg?: { evt_cd: string }[] } };
          comp_evt_cfg?: { evt_cd: string | null }[] | { evt_cd: string | null };
        };
        const plan = Array.isArray(rowAny.team_comp_plan_rel) ? rowAny.team_comp_plan_rel[0] : rowAny.team_comp_plan_rel;
        const comp = Array.isArray(plan.comp_mst) ? plan.comp_mst[0] : plan.comp_mst;
        const evt = Array.isArray(rowAny.comp_evt_cfg) ? rowAny.comp_evt_cfg[0] : rowAny.comp_evt_cfg;
        return {
          id: comp.comp_id,
          title: comp.comp_nm,
          start_date: comp.stt_dt,
          location: comp.loc_nm,
          sport: comp.comp_sprt_cd,
          event_types: (comp.comp_evt_cfg ?? []).map((e) => e.evt_cd?.toUpperCase()),
          registeredEventType: evt?.evt_cd ?? null,
        } as Competition;
      })
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

    setCompetitions(unique);
    setLoadingComps(false);
  }

  // 검색어 디바운스 후 전체 대회 검색
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      const list = await searchCompetitions(searchQuery);
      setSearchResults(list as Competition[]);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 대회 선택 — 참가한 대회면 참가 종목 고정으로 바로 step 3, 검색 대회는 step 2(종목 선택)
  function handleSelectCompetition(comp: Competition) {
    setSelectedComp(comp);
    setSearchQuery("");
    setSearchResults([]);
    const registered = (comp.registeredEventType ?? "").trim().toUpperCase();
    setSelectedEventType(registered);
    setCustomEventType("");
    setStep(comp.registeredEventType ? 3 : 2);
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

  // 뒤로가기 (참가한 대회는 step 2 없이 3으로 왔으므로 step 3에서 뒤로가면 대회 선택으로)
  function handleBack() {
    setError(null);
    if (step === 3) {
      if (selectedComp?.registeredEventType) {
        setSelectedComp(null);
        setStep(1);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      setSelectedComp(null);
      setStep(1);
    }
  }

  // 대회 정보 (DB에서 선택한 대회만)
  const competitionTitle = selectedComp?.title ?? "";
  const competitionDate = selectedComp?.start_date ?? "";
  const eventType =
    selectedEventType === EVENT_TYPE_OTHER
      ? customEventType.trim().toUpperCase()
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
    if (!canSave || !selectedComp) return;
    setIsSaving(true);
    setError(null);

    const totalSeconds = timeStringToSeconds(totalTime)!;
    const swimSeconds = isTriathlon ? timeStringToSeconds(swimTime) : null;
    const bikeSeconds = isTriathlon ? timeStringToSeconds(bikeTime) : null;
    const runSeconds = isTriathlon ? timeStringToSeconds(runTime) : null;

    // 기록 저장
    const { error: insertError } = await supabase
      .from("rec_race_hist")
      .insert({
        mem_id: memberId,
        rec_time_sec: totalSeconds,
        race_nm: competitionTitle,
        race_dt: competitionDate,
        swim_time_sec: swimSeconds,
        bike_time_sec: bikeSeconds,
        run_time_sec: runSeconds,
        rec_src_cd: "manual",
        vers: 0,
        del_yn: false,
      });

    if (insertError) {
      setIsSaving(false);
      setError("저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }

    // 검색으로 골랐을 수 있으므로, 해당 대회에 참가 신청이 없으면 참가로 추가 (정합성)
    const { data: plan } = await supabase
      .from("team_comp_plan_rel")
      .select("team_comp_id")
      .eq("comp_id", selectedComp.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (plan) {
      await supabase
        .from("comp_reg_rel")
        .upsert(
          {
            team_comp_id: plan.team_comp_id,
            mem_id: memberId,
            prt_role_cd: "participant",
            vers: 0,
            del_yn: false,
          },
          { onConflict: "team_comp_id,mem_id,vers" },
        );
    }

    setIsSaving(false);
    onSaved();
    onOpenChange(false);
  }

  /* ---------- 렌더링 ---------- */
  const scrollSearchInputAboveKeyboard = useRef(() => {
    const input = searchInputRef.current;
    const container = dialogContentRef.current;
    if (!input || !container || document.activeElement !== input) return;
    const vv = window.visualViewport;
    const rect = input.getBoundingClientRect();
    const padding = 12;
    const visibleBottom = vv ? vv.height : window.innerHeight;
    if (rect.bottom > visibleBottom - padding) {
      const scrollAmount = rect.bottom - (visibleBottom - padding);
      container.scrollTop += scrollAmount;
    }
  }).current;

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener("resize", scrollSearchInputAboveKeyboard);
    return () => vv.removeEventListener("resize", scrollSearchInputAboveKeyboard);
  }, [scrollSearchInputAboveKeyboard]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dialogContentRef} className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>기록 입력</DialogTitle>
          <DialogDescription>
            {step === 1 && "대회를 선택해 주세요."}
            {step === 2 && "코스를 선택해 주세요."}
            {step === 3 && "기록을 입력해 주세요."}
          </DialogDescription>
        </DialogHeader>

        {step > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="w-fit px-0 text-muted-foreground hover:text-foreground"
          >
            &larr; 뒤로
          </Button>
        )}

        {/* 단계 1: 최근 3개월 참가 대회 + 전체 대회 검색 */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            {loadingComps ? (
              <p className="text-sm text-muted-foreground">
                대회 목록 불러오는 중...
              </p>
            ) : competitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                최근 3개월 내 참가한 대회가 없습니다. 아래에서 검색해 보세요.
              </p>
            ) : (
              <>
                <p className="text-xs font-medium text-muted-foreground">최근 3개월 내 참가한 대회</p>
                {competitions.map((comp) => (
                  <Button
                    key={comp.id}
                    type="button"
                    variant="outline"
                    onClick={() => handleSelectCompetition(comp)}
                    className="h-auto w-full flex-col items-start gap-0.5 border-[1.5px] px-4 py-3 hover:border-primary/50"
                  >
                    <p className="text-sm font-medium">{comp.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {comp.start_date} &middot; {comp.location ?? "-"}
                    </p>
                  </Button>
                ))}
              </>
            )}

            <div className="border-t border-border pt-3">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">대회 검색</label>
              <Input
                ref={searchInputRef}
                placeholder="대회명으로 검색 (전체 목록)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  setTimeout(scrollSearchInputAboveKeyboard, 350);
                  setTimeout(scrollSearchInputAboveKeyboard, 600);
                }}
                className="mb-2"
              />
              {searchLoading && (
                <p className="text-xs text-muted-foreground">검색 중...</p>
              )}
              {!searchLoading && searchResults.length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {searchResults.map((comp) => (
                    <Button
                      key={comp.id}
                      type="button"
                      variant="ghost"
                      onClick={() => handleSelectCompetition(comp)}
                      className="h-auto w-full flex-col items-start gap-0.5 px-3 py-2 hover:bg-muted/50"
                    >
                      <p className="font-medium">{comp.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {comp.start_date} &middot; {comp.location ?? "-"}
                      </p>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 단계 2: 검색으로 선택한 대회만 종목 선택 (참가한 대회는 step 3으로 직행) */}
        {step === 2 && selectedComp && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{selectedComp.title}</p>
              <p className="text-xs text-muted-foreground">
                {selectedComp.start_date} &middot;{" "}
                {selectedComp.location ?? "-"}
              </p>

              {/* 종목 선택 */}
              <div className="flex flex-wrap gap-1.5">
                    {eventTypeOptions.map((opt) => (
                      <Button
                        key={opt}
                        type="button"
                        variant={selectedEventType === opt ? "default" : "outline"}
                        size="xs"
                        onClick={() => {
                          if (opt === EVENT_TYPE_OTHER) {
                            setSelectedEventType(EVENT_TYPE_OTHER);
                            setCustomEventType("");
                          } else {
                            setCustomEventType("");
                            handleSelectEventType(opt);
                          }
                        }}
                        className={cn(
                          "rounded-full px-3",
                          selectedEventType === opt
                            ? ""
                            : "text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {opt === EVENT_TYPE_OTHER ? "기타 (직접 입력)" : opt}
                      </Button>
                    ))}
                  </div>
                  {selectedEventType === EVENT_TYPE_OTHER && (
                    <div className="flex flex-col gap-1.5">
                      <Input
                        placeholder="예: 10K, HALF"
                        value={customEventType}
                        onChange={(e) => setCustomEventType(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="lg"
                        disabled={!customEventType.trim()}
                        onClick={() => {
                          setTotalTime("");
                          setError(null);
                          setStep(3);
                        }}
                        className="h-12 w-full rounded-xl font-semibold"
                      >
                        다음
                      </Button>
                    </div>
                  )}
            </div>
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
                      트랜지션이 음수입니다. 시간을 다시 확인해 주세요.
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

            <Button
              type="button"
              size="lg"
              disabled={!canSave || isSaving}
              onClick={handleSave}
              className="h-12 w-full rounded-xl font-semibold"
            >
              {isSaving ? "저장 중..." : "기록 저장"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
