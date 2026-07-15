"use client";

import { useEffect, useMemo, useState } from "react";


import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  buildEventTypeOptionList,
  COMP_EVT_TYPE_OTHER,
  normalizeCompEvtTypeKey,
  sanitizeAsciiUpperCompEvtTypeInput,
} from "@/lib/comp-evt-type";
import { todayKST } from "@/lib/dayjs";
import {
  cmmCdRowsForGrp,
  eventTypeCodesForSprtFromCmmRows,
  type CachedCmmCdRow,
} from "@/lib/queries/cmm-cd-cached";
import { cn } from "@/lib/utils";
import {
  competitionRegisterSchema,
  competitionRegisterSchemaAllowPast,
  type CompetitionRegisterDatePolicy,
  type CompetitionRegisterValues,
} from "@/lib/validations/competition";

import { createCompetition } from "@/app/actions/create-competition";

import { InactiveGateDialog } from "@/components/common/inactive-gate-dialog";
import { detectInAppBrowser, openExternalBrowser } from "@/components/in-app-browser-gate";
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


import type { Competition, MemberStatus } from "./types";

const defaultValues: CompetitionRegisterValues = {
  title: "",
  sport: "road_run",
  startDate: "",
  endDate: "",
  location: "",
  sourceUrl: "",
  selectedEventTypes: [],
  customEventType: "",
};

function resolveSubmittedEventTypes(data: CompetitionRegisterValues): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of data.selectedEventTypes.filter(t => t !== COMP_EVT_TYPE_OTHER)) {
    const k = normalizeCompEvtTypeKey(String(raw));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

interface CompetitionRegisterDialogProps {
  /** 공통코드 캐시 행 전체 (`getCachedCmmCdRows`) */
  cmmCdRows: CachedCmmCdRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberStatus: MemberStatus;
  onCreated: (competition: Competition) => void;
  /** 다른 다이얼로그 위에 겹쳐 표시할 때 오버레이·콘텐츠 z-index 상향 */
  stackElevated?: boolean;
  /** 열 때 시작일(YYYY-MM-DD) 미리 채움 */
  prefillStartDate?: string;
  /** OCR로 읽은 대회명 prefill (선택) */
  prefillTitle?: string;
  /** 날짜 정책: 대회 탭은 미래/당일만, 기록 입력은 과거 허용 */
  datePolicy?: CompetitionRegisterDatePolicy;
}

export function CompetitionRegisterDialog({
  cmmCdRows,
  open,
  onOpenChange,
  memberStatus,
  onCreated,
  stackElevated = false,
  prefillStartDate,
  prefillTitle,
  datePolicy = "future-only",
}: CompetitionRegisterDialogProps) {
  const registerSchema = useMemo(
    () =>
      datePolicy === "allow-past"
        ? competitionRegisterSchemaAllowPast
        : competitionRegisterSchema,
    [datePolicy],
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CompetitionRegisterValues>({
    defaultValues,
    resolver: zodResolver(registerSchema),
  });

  const [inactiveGateOpen, setInactiveGateOpen] = useState(false);

  const sport = watch("sport");
  const selectedEventTypes = watch("selectedEventTypes");
  const customEventType = watch("customEventType");

  const sportOptions = useMemo(
    () => cmmCdRowsForGrp(cmmCdRows, "COMP_SPRT_CD"),
    [cmmCdRows],
  );

  /** 신규 대회: comp_evt_cfg 없음 → 기본 공통코드만 + 기타 (기록 입력과 동일 `buildEventTypeOptionList` 규칙) */
  const eventChipList = useMemo(() => {
    const defaults = eventTypeCodesForSprtFromCmmRows(cmmCdRows, sport || null);
    const merged = buildEventTypeOptionList([], defaults);
    return [...merged, COMP_EVT_TYPE_OTHER];
  }, [cmmCdRows, sport]);

  useEffect(() => {
    setValue("selectedEventTypes", []);
    setValue("customEventType", "");
  }, [sport, setValue]);

  useEffect(() => {
    if (open) {
      const defaultSport = sportOptions.find((o) => o.cd === "road_run")?.cd ?? sportOptions[0]?.cd ?? "";
      reset({
        ...defaultValues,
        sport: defaultSport,
        ...(prefillStartDate?.trim() ? { startDate: prefillStartDate.trim() } : {}),
        ...(prefillTitle?.trim() ? { title: prefillTitle.trim() } : {}),
      });
    }
    // sportOptions는 열릴 때 기본 종목만 채우면 됨. 열려 있는 동안 cmmCdRows 참조 변경으로 reset이 재실행되면 입력 중 값이 날아갈 수 있음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillStartDate, prefillTitle, reset]);

  const selectedCourseCount = selectedEventTypes.filter((t) => t !== COMP_EVT_TYPE_OTHER).length;

  const toggleEventType = (type: string) => {
    const current = selectedEventTypes;
    setValue(
      "selectedEventTypes",
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );
  };

  async function onSubmit(data: CompetitionRegisterValues) {
    const eventTypes = resolveSubmittedEventTypes(data);
    const result = await createCompetition({
      title: data.title,
      sport: data.sport,
      startDate: data.startDate,
      endDate: data.endDate || null,
      location: data.location,
      eventTypes,
      sourceUrl: data.sourceUrl,
      datePolicy,
    });

    if (!result.ok) {
      setError("root", { message: result.message ?? "등록에 실패했습니다. 다시 시도해 주세요." });
      return;
    }

    if (result.competition) onCreated(result.competition);
    onOpenChange(false);
  }

  const showAuthMessage = memberStatus.status !== "ready" && memberStatus.status !== "inactive";
  const showInactiveMessage = memberStatus.status === "inactive";
  const inactiveKind =
    memberStatus.status === "inactive" ? memberStatus.memberSt : undefined;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={stackElevated ? "z-[60]" : undefined}
        className={cn(
          "max-h-[85vh] overflow-y-auto sm:max-w-lg",
          stackElevated && "z-[60]",
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {datePolicy === "allow-past" ? "대회 추가" : "대회 등록"}
          </DialogTitle>
          <DialogDescription>
            {datePolicy === "allow-past"
              ? "기록 입력을 위해 등록되지 않은 대회를 추가합니다."
              : "앞으로 참가할 대회를 등록합니다."}
          </DialogDescription>
        </DialogHeader>

        {showInactiveMessage ? (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-destructive">현재 비활성 상태라 대회를 등록할 수 없어요.</p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setInactiveGateOpen(true)}
            >
              관리자에게 문의하기
            </Button>
          </div>
        ) : showAuthMessage ? (
          <div className="flex flex-col gap-3 text-sm">
            {memberStatus.status === "member-fetch-error" ? (
              <>
                <p>회원 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => window.location.reload()}
                >
                  새로고침
                </Button>
              </>
            ) : (
              <>
                <p>로그인 후 대회를 등록할 수 있습니다.</p>
                <Button
                  className="w-full"
                  onClick={() => {
                    const inApp = detectInAppBrowser();
                    if (inApp) openExternalBrowser(window.location.origin + "/auth/login?next=%2Fraces");
                    else window.location.href = "/auth/login?next=%2Fraces";
                  }}
                >
                  로그인
                </Button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-title">대회명 *</Label>
              <Input
                id="comp-title"
                placeholder="예: 2026 서울마라톤"
                {...register("title")}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-sport">종목 *</Label>
              <Select
                value={sport}
                onValueChange={(v) => setValue("sport", v, { shouldValidate: true })}
              >
                <SelectTrigger id="comp-sport">
                  <SelectValue placeholder="종목 선택" />
                </SelectTrigger>
                <SelectContent className={cn(stackElevated && "z-[100]")}>
                  {sportOptions.map((s) => (
                    <SelectItem key={s.cd} value={s.cd}>
                      {s.cd_nm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.sport && <p className="text-xs text-destructive">{errors.sport.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-start">시작일 *</Label>
              <Input
                id="comp-start"
                type="date"
                min={datePolicy === "future-only" ? todayKST() : undefined}
                max="9999-12-31"
                {...register("startDate")}
              />
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              {datePolicy === "future-only" && (
                <p className="text-xs text-muted-foreground">
                  지난 대회는 기록 입력에서 추가해 주세요.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-end">종료일</Label>
              <Input
                id="comp-end"
                type="date"
                max="9999-12-31"
                {...register("endDate")}
              />
              {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-location">장소 *</Label>
              <Input
                id="comp-location"
                placeholder="예: 서울 여의도"
                {...register("location")}
              />
              {errors.location && <p className="text-xs text-destructive">{errors.location.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                참가 코스 *
                {selectedCourseCount > 0 ? ` (${selectedCourseCount}개 선택)` : ""}
              </Label>
              <div className="flex flex-col gap-2">
                {/* 기본 목록 토글 */}
                {eventChipList.filter(t => t !== COMP_EVT_TYPE_OTHER).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {eventChipList.filter(t => t !== COMP_EVT_TYPE_OTHER).map((type) => (
                      <Button
                        key={type}
                        type="button"
                        size="xs"
                        onClick={() => toggleEventType(type)}
                        variant={selectedEventTypes.includes(type) ? "default" : "outline"}
                        className={cn(
                          "rounded-full",
                          !selectedEventTypes.includes(type) && "text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                )}
                {/* 직접 추가한 커스텀 코스 태그 */}
                {selectedEventTypes.filter(t => t !== COMP_EVT_TYPE_OTHER && !eventChipList.includes(t)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedEventTypes.filter(t => t !== COMP_EVT_TYPE_OTHER && !eventChipList.includes(t)).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setValue("selectedEventTypes", selectedEventTypes.filter(t2 => t2 !== type), { shouldValidate: true })}
                        className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground"
                      >
                        {type} ×
                      </button>
                    ))}
                  </div>
                )}
                {/* 직접 입력 */}
                <div className="flex gap-1.5">
                  <Input
                    placeholder="직접 입력 (예: 12K, HALF, 영문·숫자만)"
                    value={customEventType}
                    onChange={(e) => setValue("customEventType", sanitizeAsciiUpperCompEvtTypeInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = customEventType.trim();
                        if (!val || selectedEventTypes.includes(val)) return;
                        setValue("selectedEventTypes", [...selectedEventTypes, val], { shouldValidate: true });
                        setValue("customEventType", "");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const val = customEventType.trim();
                      if (!val || selectedEventTypes.includes(val)) return;
                      setValue("selectedEventTypes", [...selectedEventTypes, val], { shouldValidate: true });
                      setValue("customEventType", "");
                    }}
                  >
                    추가
                  </Button>
                </div>
              </div>
              {errors.selectedEventTypes && (
                <p className="text-xs text-destructive">{errors.selectedEventTypes.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-url">대회 링크 *</Label>
              <Input
                id="comp-url"
                type="url"
                placeholder="https://..."
                {...register("sourceUrl")}
              />
              {errors.sourceUrl && <p className="text-xs text-destructive">{errors.sourceUrl.message}</p>}
            </div>

            {errors.root && (
              <p className="text-xs text-destructive">{errors.root.message}</p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "등록 중..." : "대회 등록"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>

    <InactiveGateDialog open={inactiveGateOpen} onOpenChange={setInactiveGateOpen} kind={inactiveKind} />
    </>
  );
}
