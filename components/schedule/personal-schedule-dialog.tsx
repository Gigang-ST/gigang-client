"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { History, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { dayjs } from "@/lib/dayjs";
import { raceTimeKST, tmToHHmm, type RecentPersonalSchedule } from "@/lib/personal-schedule";
import { personalScheduleSchema, type PersonalScheduleInput } from "@/lib/validations/personal-schedule";

import {
  createPersonalSchedule,
  getRecentPersonalSchedules,
  updatePersonalSchedule,
} from "@/app/actions/schedule/manage-personal-schedule";

import { AutoGrowTextarea } from "@/components/common/auto-grow-textarea";
import { RequiredMark } from "@/components/common/required-mark";
import { Micro } from "@/components/common/typography";
import type { CalendarRace } from "@/components/home/mini-calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

/** 복제로 채워 넣을 값 — 날짜는 없다(새 일정 기준이라 다시 고른다) */
export type PersonalScheduleFormPrefill = Pick<PersonalScheduleInput, "sch_nm" | "stt_tm" | "end_tm" | "cont_txt">;

export type PersonalScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 있으면 수정, 없으면 새로 만들기 */
  target?: CalendarRace | null;
  /** 새로 만들 때 채워 둘 날짜(달력 선택일·오늘) */
  defaultDate?: string;
  /** 상세의 [복제] — 제목·시각·메모를 채우고 날짜는 비운다 */
  prefill?: PersonalScheduleFormPrefill | null;
  onSuccess?: () => void;
};

const EMPTY: PersonalScheduleInput = { sch_nm: "", sch_dt: "", stt_tm: null, end_tm: null, cont_txt: null };

/**
 * 개인 일정 추가·수정 폼 — 모임 폼(`GatheringFormDialog`)과 같은 짜임이다.
 * 삭제·복제는 상세(`PersonalScheduleDetailDialog`)에 있고, 만들 때는 **최근 불러오기**로
 * 예전 일정의 제목·시각·메모를 가져온다(모임의 「최근 불러오기」와 같은 자리·같은 규칙).
 *
 * **복제·불러오기 모두 날짜는 넣지 않는다.** 같은 시간대에 반복되는 일정이 많아 시각은 그대로 두는 게
 * 편하고, 날짜까지 복사하면 같은 날에 똑같은 일정이 하나 더 생기기 쉽다. 복제는 날짜를 비우고
 * (검증이 「날짜를 골라 주세요」로 막는다), 불러오기는 지금 폼의 날짜(달력 선택일)를 그대로 둔다.
 */
export function PersonalScheduleDialog({
  open,
  onOpenChange,
  target,
  defaultDate,
  prefill,
  onSuccess,
}: PersonalScheduleDialogProps) {
  const [rootError, setRootError] = useState<string | null>(null);
  const isEdit = !!target;

  // 최근 불러오기 팝업 — 목록은 버튼을 처음 눌렀을 때 한 번만 조회하고 다이얼로그가 열려 있는 동안 재사용
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentList, setRecentList] = useState<RecentPersonalSchedule[] | null>(null);
  const [recentStatus, setRecentStatus] = useState<"idle" | "loading" | "error">("idle");

  const form = useForm<PersonalScheduleInput>({
    resolver: zodResolver(personalScheduleSchema),
    defaultValues: EMPTY,
  });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRootError(null);
    setRecentOpen(false);
    setRecentList(null);
    setRecentStatus("idle");
    form.reset(
      target
        ? {
            sch_nm: target.title,
            sch_dt: target.start_date,
            stt_tm: raceTimeKST(target.evt_stt_at),
            end_tm: raceTimeKST(target.evt_end_at),
            cont_txt: target.cont_txt ?? null,
          }
        : prefill
          ? { ...EMPTY, ...prefill, sch_dt: "" }
          : { ...EMPTY, sch_dt: defaultDate ?? "" },
    );
  }, [open, target, prefill, defaultDate, form]);

  async function openRecent() {
    setRecentOpen(true);
    if (recentList !== null || recentStatus === "loading") return;
    setRecentStatus("loading");
    try {
      setRecentList(await getRecentPersonalSchedules());
      setRecentStatus("idle");
    } catch {
      setRecentStatus("error");
    }
  }

  /** 불러온 일정의 제목·시각·메모만 넣는다 — 날짜는 지금 폼 값을 둔다 */
  function applyRecent(r: RecentPersonalSchedule) {
    form.setValue("sch_nm", r.sch_nm, { shouldDirty: true });
    form.setValue("stt_tm", tmToHHmm(r.stt_tm), { shouldDirty: true });
    form.setValue("end_tm", tmToHHmm(r.end_tm), { shouldDirty: true });
    form.setValue("cont_txt", r.cont_txt ?? null, { shouldDirty: true });
    form.clearErrors();
    setRecentOpen(false);
  }

  async function onSubmit(values: PersonalScheduleInput) {
    setRootError(null);
    try {
      if (isEdit && target) {
        await updatePersonalSchedule({ ...values, mem_sch_id: target.id });
      } else {
        await createPersonalSchedule(values);
      }
      toast.success(isEdit ? "개인 일정을 수정했어요." : "개인 일정을 추가했어요.");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setRootError(err instanceof Error ? err.message : "오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0">
        <DialogHeader className="gap-1 px-5 pb-3 pt-5">
          <DialogTitle>{isEdit ? "개인 일정 수정" : "개인 일정 추가"}</DialogTitle>
          <Micro className="flex items-center gap-1">
            <Lock className="size-3" aria-hidden />
            나만 볼 수 있어요
          </Micro>
        </DialogHeader>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <FormField
              control={form.control}
              name="sch_nm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>제목<RequiredMark /></FormLabel>
                  <FormControl>
                    <Input placeholder="예: LSD 20km, 인터벌, 회복 조깅" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sch_dt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>날짜<RequiredMark /></FormLabel>
                  <FormControl>
                    <Input type="date" className="text-[13px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="stt_tm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>시작 시각</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        className="text-[13px]"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_tm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>종료 시각</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        className="text-[13px]"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Micro className="-mt-2">시각을 비우면 종일 일정이에요.</Micro>

            <FormField
              control={form.control}
              name="cont_txt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>메모</FormLabel>
                  <FormControl>
                    <AutoGrowTextarea
                      placeholder="메모를 남겨 두세요."
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {rootError && <p className="text-[12px] font-medium text-destructive">{rootError}</p>}

            <div className="flex items-center gap-2 pb-1">
              {/* 최근 불러오기 (추가할 때만) — 모임 폼과 같은 자리: 취소/추가와 같은 줄 왼쪽 */}
              {!isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={openRecent}
                  disabled={isSubmitting}
                >
                  <History className="size-4" />
                  최근 불러오기
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  취소
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "저장 중..." : isEdit ? "저장" : "추가"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* 최근 불러오기 팝업 — 모임 폼의 팝업과 같은 생김새 */}
    <Dialog open={recentOpen} onOpenChange={setRecentOpen}>
      <DialogContent className="flex max-h-[70dvh] flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>최근 개인 일정 불러오기</DialogTitle>
        </DialogHeader>

        <Separator />

        <div className="flex flex-col gap-2 overflow-y-auto px-5 py-4">
          {recentStatus === "loading" && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">불러오는 중...</p>
          )}
          {recentStatus === "error" && (
            <p className="py-6 text-center text-[13px] text-destructive">불러오기에 실패했습니다.</p>
          )}
          {recentStatus === "idle" && recentList?.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">이전에 만든 개인 일정이 없습니다.</p>
          )}
          {recentStatus === "idle" &&
            recentList?.map((r) => {
              const stt = tmToHHmm(r.stt_tm);
              const end = tmToHHmm(r.end_tm);
              return (
                <button
                  key={r.mem_sch_id}
                  type="button"
                  onClick={() => applyRecent(r)}
                  className="flex flex-col items-start gap-0.5 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted active:bg-muted"
                >
                  <span className="line-clamp-1 text-[14px] font-medium text-foreground">{r.sch_nm}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {/* sch_dt(date)라 tz 없이 찍어도 날짜가 밀리지 않는다 */}
                    {dayjs(r.sch_dt).format("YY.MM.DD")}
                    {" · "}
                    {stt ? (end ? `${stt} ~ ${end}` : stt) : "종일"}
                  </span>
                </button>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
