"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createCompetition } from "@/app/actions/create-competition";
import {
  competitionRegisterSchema,
  type CompetitionRegisterValues,
} from "@/lib/validations/competition";
import {
  buildEventTypeOptionList,
  COMP_EVT_TYPE_OTHER,
  normalizeCompEvtTypeKey,
  sanitizeAsciiUpperCompEvtTypeInput,
} from "@/lib/comp-evt-type";
import {
  cmmCdRowsForGrp,
  eventTypeCodesForSprtFromCmmRows,
  type CachedCmmCdRow,
} from "@/lib/queries/cmm-cd-cached";
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
import type { MemberStatus } from "./types";

const defaultValues: CompetitionRegisterValues = {
  title: "",
  sport: "",
  startDate: "",
  endDate: "",
  location: "",
  sourceUrl: "",
  selectedEventTypes: [],
  customEventType: "",
};

function resolveSubmittedEventTypes(data: CompetitionRegisterValues): string[] {
  const base = data.selectedEventTypes.filter((t) => t !== COMP_EVT_TYPE_OTHER);
  const otherOn = data.selectedEventTypes.includes(COMP_EVT_TYPE_OTHER);
  const custom = otherOn
    ? sanitizeAsciiUpperCompEvtTypeInput(data.customEventType).trim()
    : "";
  const merged = [...base];
  if (custom) merged.push(custom);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of merged) {
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
  onCreated: () => void;
  /** 다른 다이얼로그 위에 겹쳐 표시할 때 오버레이·콘텐츠 z-index 상향 */
  stackElevated?: boolean;
  /** 열 때 시작일(YYYY-MM-DD) 미리 채움 */
  prefillStartDate?: string;
}

export function CompetitionRegisterDialog({
  cmmCdRows,
  open,
  onOpenChange,
  memberStatus,
  onCreated,
  stackElevated = false,
  prefillStartDate,
}: CompetitionRegisterDialogProps) {
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
    resolver: zodResolver(competitionRegisterSchema),
  });

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
      const firstSprt = sportOptions[0]?.cd ?? "";
      reset({
        ...defaultValues,
        sport: firstSprt,
        ...(prefillStartDate?.trim() ? { startDate: prefillStartDate.trim() } : {}),
      });
    }
  }, [open, prefillStartDate, reset, sportOptions]);

  const otherSelected = selectedEventTypes.includes(COMP_EVT_TYPE_OTHER);

  const selectedCourseCount = useMemo(() => {
    const pre = selectedEventTypes.filter((t) => t !== COMP_EVT_TYPE_OTHER).length;
    const other =
      otherSelected && sanitizeAsciiUpperCompEvtTypeInput(customEventType).trim()
        ? 1
        : 0;
    return pre + other;
  }, [selectedEventTypes, otherSelected, customEventType]);

  const toggleEventType = (type: string) => {
    const current = selectedEventTypes;
    if (type === COMP_EVT_TYPE_OTHER) {
      if (current.includes(COMP_EVT_TYPE_OTHER)) {
        setValue(
          "selectedEventTypes",
          current.filter((t) => t !== COMP_EVT_TYPE_OTHER),
        );
        setValue("customEventType", "");
      } else {
        setValue("selectedEventTypes", [...current, COMP_EVT_TYPE_OTHER]);
      }
      return;
    }
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
    });

    if (!result.ok) {
      setError("root", { message: result.message ?? "등록에 실패했습니다. 다시 시도해 주세요." });
      return;
    }

    onCreated();
    onOpenChange(false);
  }

  const showAuthMessage = memberStatus.status !== "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={stackElevated ? "z-[60]" : undefined}
        className={cn(
          "max-h-[85vh] overflow-y-auto sm:max-w-lg",
          stackElevated && "z-[60]",
        )}
      >
        <DialogHeader>
          <DialogTitle>대회 등록</DialogTitle>
          <DialogDescription>
            등록되지 않은 대회를 직접 등록합니다.
          </DialogDescription>
        </DialogHeader>

        {showAuthMessage ? (
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
                <Button asChild className="w-full">
                  <Link href="/auth/login?next=%2Fraces">로그인</Link>
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
                max="9999-12-31"
                {...register("startDate")}
              />
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
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
              {eventChipList.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {eventChipList.map((type) => (
                      <Button
                        key={type}
                        type="button"
                        size="xs"
                        onClick={() => toggleEventType(type)}
                        variant={
                          type === COMP_EVT_TYPE_OTHER
                            ? selectedEventTypes.includes(COMP_EVT_TYPE_OTHER)
                              ? "default"
                              : "outline"
                            : selectedEventTypes.includes(type)
                              ? "default"
                              : "outline"
                        }
                        className={cn(
                          "rounded-full",
                          type !== COMP_EVT_TYPE_OTHER &&
                            !selectedEventTypes.includes(type) &&
                            "text-muted-foreground hover:border-primary/50",
                          type === COMP_EVT_TYPE_OTHER &&
                            !selectedEventTypes.includes(COMP_EVT_TYPE_OTHER) &&
                            "text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {type === COMP_EVT_TYPE_OTHER ? "기타 (직접 입력)" : type}
                      </Button>
                    ))}
                  </div>
                  {otherSelected && (
                    <Input
                      placeholder="예: 12K, HALF (영문·숫자만)"
                      value={customEventType}
                      onChange={(e) =>
                        setValue(
                          "customEventType",
                          sanitizeAsciiUpperCompEvtTypeInput(e.target.value),
                          { shouldValidate: true },
                        )
                      }
                    />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">종목을 먼저 선택해 주세요.</p>
              )}
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
  );
}
