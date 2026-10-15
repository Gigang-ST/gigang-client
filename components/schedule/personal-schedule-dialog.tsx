"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Lock, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { raceTimeKST } from "@/lib/personal-schedule";
import { personalScheduleSchema, type PersonalScheduleInput } from "@/lib/validations/personal-schedule";

import {
  createPersonalSchedule,
  deletePersonalSchedule,
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

export type PersonalScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 있으면 수정, 없으면 새로 만들기 */
  target?: CalendarRace | null;
  /** 새로 만들 때 채워 둘 날짜(달력 선택일·오늘) */
  defaultDate?: string;
  onSuccess?: () => void;
};

const EMPTY: PersonalScheduleInput = { sch_nm: "", sch_dt: "", stt_tm: null, end_tm: null, cont_txt: null };

/**
 * 개인 일정 — 만들기·수정·복제·삭제를 다이얼로그 하나가 맡는다.
 *
 * 따로 상세 화면을 두지 않는다. 모임·정보와 달리 댓글·참석자처럼 "보기만 하는" 내용이 없어,
 * 상세를 거치면 고치려고 한 번 더 누르는 단계만 는다. 그래서 항목을 누르면 곧장 수정 폼이다.
 *
 * **복제는 제목·시각·메모를 두고 날짜만 비운다.** 반복 일정을 따로 만들지 않은 대신이다 —
 * 같은 시간대에 반복되는 일이 많아 시각은 그대로 두는 게 편하고, 날짜는 비워야 같은 날에
 * 똑같은 일정을 실수로 하나 더 만드는 일이 없다(빈 날짜는 검증이 "날짜를 골라 주세요"로 막는다).
 */
export function PersonalScheduleDialog({ open, onOpenChange, target, defaultDate, onSuccess }: PersonalScheduleDialogProps) {
  const [rootError, setRootError] = useState<string | null>(null);
  // 수정 중 [복제]를 누르면 같은 다이얼로그가 만들기로 넘어간다 — 닫으면 원래대로
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEdit = !!target && !cloning;

  const form = useForm<PersonalScheduleInput>({
    resolver: zodResolver(personalScheduleSchema),
    defaultValues: EMPTY,
  });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRootError(null);
    setCloning(false);
    form.reset(
      target
        ? {
            sch_nm: target.title,
            sch_dt: target.start_date,
            stt_tm: raceTimeKST(target.evt_stt_at),
            end_tm: raceTimeKST(target.evt_end_at),
            cont_txt: target.cont_txt ?? null,
          }
        : { ...EMPTY, sch_dt: defaultDate ?? "" },
    );
  }, [open, target, defaultDate, form]);

  function startClone() {
    setCloning(true);
    setRootError(null);
    form.setValue("sch_dt", "");
    form.clearErrors();
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

  async function handleDelete() {
    if (!target || !window.confirm("이 개인 일정을 삭제할까요?")) return;
    setDeleting(true);
    try {
      await deletePersonalSchedule(target.id);
      toast.success("개인 일정을 삭제했어요.");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setRootError(err instanceof Error ? err.message : "삭제에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setDeleting(false);
    }
  }

  const busy = isSubmitting || deleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0">
        <DialogHeader className="gap-1 px-5 pb-3 pt-5">
          <DialogTitle>{isEdit ? "개인 일정 수정" : cloning ? "개인 일정 복제" : "개인 일정 추가"}</DialogTitle>
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
                    <Input placeholder="예: 병원, 개인 훈련, 가족 모임" {...field} />
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
                    <Input type="date" className="text-[13px]" {...field} autoFocus={cloning} />
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
              {isEdit && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={handleDelete}
                    disabled={busy}
                    aria-label="삭제"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={startClone} disabled={busy}>
                    <Copy className="size-3.5" />
                    복제
                  </Button>
                </>
              )}
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  취소
                </Button>
                <Button type="submit" disabled={busy}>
                  {isSubmitting ? "저장 중..." : isEdit ? "저장" : "추가"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
