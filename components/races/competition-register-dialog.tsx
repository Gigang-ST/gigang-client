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

const defaultValues: CompetitionRegisterValues = {
  title: "",
  sport: "" as CompetitionRegisterValues["sport"],
  startDate: "",
  endDate: "",
  location: "",
  sourceUrl: "",
  selectedEventTypes: [],
};

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

  // 종목 변경 시 코스 선택 초기화
  const eventTypeOptions = useMemo(() => {
    return resolveSportConfig(sport || null).eventTypes;
  }, [sport]);

  useEffect(() => {
    setValue("selectedEventTypes", []);
  }, [sport, setValue]);

  // 다이얼로그 열릴 때 폼 초기화
  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open, reset]);

  const toggleEventType = (type: string) => {
    const current = selectedEventTypes;
    setValue(
      "selectedEventTypes",
      current.includes(type) ? current.filter(t => t !== type) : [...current, type],
    );
  };

  async function onSubmit(data: CompetitionRegisterValues) {
    const result = await createCompetition({
      title: data.title,
      sport: data.sport,
      startDate: data.startDate,
      endDate: data.endDate || null,
      location: data.location,
      eventTypes: data.selectedEventTypes,
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
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
              <Select value={sport} onValueChange={v => setValue("sport", v as CompetitionRegisterValues["sport"], { shouldValidate: true })}>
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
              <Label>참가 코스 * {selectedEventTypes.length > 0 && `(${selectedEventTypes.length}개 선택)`}</Label>
              {eventTypeOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {eventTypeOptions.map(type => (
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
              ) : (
                <p className="text-xs text-muted-foreground">종목을 먼저 선택해 주세요.</p>
              )}
              {errors.selectedEventTypes && <p className="text-xs text-destructive">{errors.selectedEventTypes.message}</p>}
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
