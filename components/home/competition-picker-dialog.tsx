"use client";

import { useEffect, useMemo, useState } from "react";

import { Calendar, ChevronRight, MapPin, Plus, Trophy } from "lucide-react";

import { sanitizeAsciiUpperCompEvtTypeInput } from "@/lib/comp-evt-type";
import { dayjs, todayKST } from "@/lib/dayjs";
import {
  cmmCdRowsForGrp,
  eventTypeCodesForSprtFromCmmRows,
  type CachedCmmCdRow,
} from "@/lib/queries/cmm-cd-cached";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { createCompetition } from "@/app/actions/create-competition";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import type { Competition } from "@/components/races/types";

type Step = "pick" | "add";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 캘린더뷰에서 날짜가 이미 선택된 경우 전달. 없으면 유저가 직접 선택. */
  defaultDate?: string;
  cmmCdRows: CachedCmmCdRow[];
  onSelectCompetition: (competition: Competition) => void;
  onCompetitionCreated: (competition: Competition) => void;
};

export function CompetitionPickerDialog({
  open,
  onOpenChange,
  defaultDate,
  cmmCdRows,
  onSelectCompetition,
  onCompetitionCreated,
}: Props) {
  const today = todayKST();
  const [step, setStep] = useState<Step>("pick");
  const [date, setDate] = useState(defaultDate ?? today);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(false);

  // 대회 추가 폼 상태
  const sportSelectOptions = useMemo(() => cmmCdRowsForGrp(cmmCdRows, "COMP_SPRT_CD"), [cmmCdRows]);
  const defaultSportCd = sportSelectOptions[0]?.cd ?? "road_run";
  const [form, setForm] = useState({
    title: "",
    sport: defaultSportCd,
    startDate: date,
    endDate: "",
    location: "",
    eventTypes: [] as string[],
    sourceUrl: "",
  });
  const [customEtInput, setCustomEtInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const formEventTypeCodes = eventTypeCodesForSprtFromCmmRows(cmmCdRows, form.sport);

  // open될 때 상태 초기화 — 다이얼로그 리셋 패턴으로 setState 직접 호출이 의도적
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!open) return;
    const d = defaultDate ?? today;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDate(d);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("pick");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((prev) => ({ ...prev, startDate: d, sport: defaultSportCd, title: "", endDate: "", location: "", eventTypes: [], sourceUrl: "" }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomEtInput("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate]);

  // 날짜 변경 시 대회 목록 조회
  useEffect(() => {
    if (!open || step !== "pick") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("comp_mst")
      .select("comp_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)")
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("stt_dt", date)
      .order("comp_nm", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setCompetitions(
          (data ?? []).map((c) => ({
            id: c.comp_id,
            external_id: "",
            sport: c.comp_sprt_cd ?? null,
            title: c.comp_nm,
            start_date: c.stt_dt,
            end_date: c.end_dt ?? null,
            location: c.loc_nm ?? null,
            event_types: (c.comp_evt_cfg as { comp_evt_type: string | null }[]).map((e) => e.comp_evt_type?.toUpperCase()).filter((e): e is string => Boolean(e)),
            source_url: c.src_url ?? null,
          })),
        );
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, date, step]);

  function handleSelectCompetition(comp: Competition) {
    onOpenChange(false);
    onSelectCompetition(comp);
  }

  function openAddForm() {
    setForm((prev) => ({ ...prev, startDate: date, title: "", endDate: "", location: "", eventTypes: [], sourceUrl: "", sport: defaultSportCd }));
    setCustomEtInput("");
    setSaveError("");
    setStep("add");
  }

  function toggleEventType(et: string) {
    setForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(et)
        ? prev.eventTypes.filter((e) => e !== et)
        : [...prev.eventTypes, et],
    }));
  }

  async function handleSave() {
    if (!form.title.trim() || !form.startDate) {
      setSaveError("대회명과 시작일은 필수입니다.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const result = await createCompetition({
      title: form.title,
      sport: form.sport,
      startDate: form.startDate,
      endDate: form.endDate || null,
      location: form.location,
      eventTypes: form.eventTypes,
      sourceUrl: form.sourceUrl,
      datePolicy: "allow-past",
    });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.message ?? "등록에 실패했습니다.");
      return;
    }
    onOpenChange(false);
    onCompetitionCreated(result.competition!);
  }

  const dateLabel = dayjs(date).format("M월 D일 (ddd)");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0">
        {step === "pick" ? (
          <>
            <DialogHeader className="px-5 pb-3 pt-5">
              <DialogTitle>대회 추가</DialogTitle>
            </DialogHeader>

            {/* 날짜 선택 — defaultDate 없을 때만 편집 가능 */}
            <div className="px-5 pb-3">
              <Input
                type="date"
                max="9999-12-31"
                value={date}
                readOnly={!!defaultDate}
                onChange={(e) => setDate(e.target.value)}
                className={cn(
                  "h-11 rounded-xl border-[1.5px] text-[15px]",
                  defaultDate && "pointer-events-none opacity-60",
                )}
              />
            </div>

            {/* 대회 목록 */}
            <div className="flex-1 overflow-y-auto px-5 pb-2">
              {loading ? (
                <div className="flex flex-col gap-2 py-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : competitions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Trophy className="size-10 text-muted-foreground/30" />
                  <p className="text-[13px] text-muted-foreground">{dateLabel}에 등록된 대회가 없습니다.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 py-1">
                  {competitions.map((comp) => (
                    <button
                      key={comp.id}
                      onClick={() => handleSelectCompetition(comp)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-secondary active:bg-secondary"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[14px] font-semibold text-foreground">{comp.title}</span>
                        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            {comp.start_date}
                          </span>
                          {comp.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="size-3 shrink-0" />
                              <span className="truncate">{comp.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 대회 직접 추가 버튼 */}
            <div className="px-5 pb-5 pt-2">
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={openAddForm}
              >
                <Plus className="size-4" />
                목록에 없는 대회 직접 추가
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="px-5 pb-3 pt-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep("pick")}
                  className="text-[13px] text-muted-foreground hover:text-foreground"
                >
                  ← 대회 선택
                </button>
              </div>
              <DialogTitle>대회 직접 추가</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
              <div className="flex flex-col gap-5">
                {/* 대회명 */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-medium text-foreground">대회명</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="대회 이름"
                    className="h-11 rounded-xl border-[1.5px] text-[15px]"
                  />
                </div>

                {/* 종목 */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-medium text-foreground">종목</label>
                  <Select
                    value={form.sport}
                    onValueChange={(v) => { setForm({ ...form, sport: v, eventTypes: [] }); setCustomEtInput(""); }}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-[1.5px] text-[15px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sportSelectOptions.map((s) => (
                        <SelectItem key={s.cd} value={s.cd}>{s.cd_nm}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 날짜 */}
                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-[13px] font-medium text-foreground">시작일</label>
                    <Input
                      type="date"
                      max="9999-12-31"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="h-11 rounded-xl border-[1.5px] text-[15px]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-[13px] font-medium text-foreground">종료일</label>
                    <Input
                      type="date"
                      max="9999-12-31"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="h-11 rounded-xl border-[1.5px] text-[15px]"
                    />
                  </div>
                </div>

                {/* 장소 */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-medium text-foreground">장소</label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="서울 여의도"
                    className="h-11 rounded-xl border-[1.5px] text-[15px]"
                  />
                </div>

                {/* 세부종목 */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-medium text-foreground">세부종목</label>
                  <div className="flex flex-wrap gap-2">
                    {formEventTypeCodes.map((et) => (
                      <Button
                        key={et}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleEventType(et)}
                        className={cn(
                          "rounded-lg text-[13px] font-medium",
                          form.eventTypes.includes(et)
                            ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {et}
                      </Button>
                    ))}
                  </div>
                  {form.eventTypes.filter((t) => !formEventTypeCodes.includes(t)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.eventTypes.filter((t) => !formEventTypeCodes.includes(t)).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setForm({ ...form, eventTypes: form.eventTypes.filter((t2) => t2 !== type) })}
                          className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground"
                        >
                          {type} ×
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="직접 입력 (예: 12K, TRAIL100)"
                      value={customEtInput}
                      onChange={(e) => setCustomEtInput(sanitizeAsciiUpperCompEvtTypeInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = customEtInput.trim();
                          if (!val || form.eventTypes.includes(val)) return;
                          setForm({ ...form, eventTypes: [...form.eventTypes, val] });
                          setCustomEtInput("");
                        }
                      }}
                      className="h-10 rounded-xl border-[1.5px] text-[13px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const val = customEtInput.trim();
                        if (!val || form.eventTypes.includes(val)) return;
                        setForm({ ...form, eventTypes: [...form.eventTypes, val] });
                        setCustomEtInput("");
                      }}
                    >
                      추가
                    </Button>
                  </div>
                </div>

                {/* URL */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-medium text-foreground">대회 URL (선택)</label>
                  <Input
                    value={form.sourceUrl}
                    onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                    placeholder="https://..."
                    className="h-11 rounded-xl border-[1.5px] text-[15px]"
                  />
                </div>

                {saveError && (
                  <p className="text-[13px] text-destructive">{saveError}</p>
                )}

                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-12 w-full rounded-xl text-[15px] font-semibold"
                >
                  {saving ? "등록 중..." : "등록"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
