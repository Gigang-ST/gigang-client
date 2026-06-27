"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { useFormPersist } from "@/lib/hooks/use-form-persist";
import { z } from "zod";

import { dayjs } from "@/lib/dayjs";
import {
  GTHR_TYPES,
  GTHR_SPRT_TYPES,
  gthrTypeLabels,
  gthrSprtLabels,
  createGthrSchema,
  type CreateGthrInput,
} from "@/lib/validations/gathering";

import { createGathering, updateGathering } from "@/app/actions/gathering/manage-gathering";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const formSchema = createGthrSchema.omit({ team_id: true });
type FormValues = z.infer<typeof formSchema>;

export type GatheringFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  defaultDate?: string;
  initialData?: {
    gthr_id: string;
    gthr_nm: string;
    gthr_type_enm: string;
    sprt_cd?: string | null;
    stt_at: string;
    end_at?: string | null;
    loc_txt?: string | null;
    desc_txt?: string | null;
    max_prt_cnt?: number | null;
  };
  /** 등록(create) 성공 시 새 모임 id 전달. 수정(edit)일 땐 undefined */
  onSuccess?: (createdGthrId?: string) => void | Promise<void>;
};

function toDatetimeLocal(utcIso: string) {
  return dayjs(utcIso).tz("Asia/Seoul").format("YYYY-MM-DDTHH:mm");
}

export function GatheringFormDialog({
  open,
  onOpenChange,
  mode,
  defaultDate,
  initialData,
  onSuccess,
}: GatheringFormDialogProps) {
  const [rootError, setRootError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      gthr_nm: "",
      gthr_type_enm: "general",
      sprt_cd: "running",
      stt_at: "",
      end_at: null,
      loc_txt: null,
      desc_txt: null,
    } as FormValues,
  });

  const { isSubmitting } = form.formState;

  const persistKey = "gathering-form-draft";
  const { clear: clearDraft } = useFormPersist(persistKey, form, open && mode === "create");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRootError(null);
    if (mode === "edit" && initialData) {
      form.reset({
        gthr_nm: initialData.gthr_nm,
        gthr_type_enm: initialData.gthr_type_enm as CreateGthrInput["gthr_type_enm"],
        sprt_cd: (initialData.sprt_cd ?? "running") as CreateGthrInput["sprt_cd"],
        stt_at: toDatetimeLocal(initialData.stt_at),
        end_at: initialData.end_at ? toDatetimeLocal(initialData.end_at) : null,
        loc_txt: initialData.loc_txt ?? null,
        desc_txt: initialData.desc_txt ?? null,
        max_prt_cnt: initialData.max_prt_cnt ?? undefined,
      });
    } else {
      // sessionStorage 저장값이 없을 때만 기본값으로 초기화 (useFormPersist가 복원 처리)
      const hasDraft = (() => { try { return !!sessionStorage.getItem(persistKey); } catch { return false; } })();
      if (!hasDraft) {
        const defaultSttAt = defaultDate
          ? `${defaultDate}T${dayjs().tz("Asia/Seoul").add(1, "hour").startOf("hour").format("HH:mm")}`
          : dayjs().tz("Asia/Seoul").add(1, "hour").startOf("hour").format("YYYY-MM-DDTHH:mm");
        form.reset({
          gthr_nm: "",
          gthr_type_enm: "general",
          sprt_cd: "running",
          stt_at: defaultSttAt,
          end_at: null,
          loc_txt: null,
          desc_txt: null,
        });
      }
    }
  }, [open, mode, initialData, defaultDate, form, persistKey]);

  async function onSubmit(values: FormValues) {
    setRootError(null);
    try {
      let createdGthrId: string | undefined;
      if (mode === "edit" && initialData) {
        await updateGathering({ gthr_id: initialData.gthr_id, ...values });
      } else {
        const result = await createGathering(values);
        createdGthrId = result.gthr_id;
      }
      clearDraft();
      onOpenChange(false);
      await onSuccess?.(createdGthrId);
    } catch (e) {
      setRootError(e instanceof Error ? e.message : "오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setRootError(null); clearDraft(); } onOpenChange(v); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>{mode === "create" ? "모임 추가" : "모임 수정"}</DialogTitle>
        </DialogHeader>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 overflow-y-auto px-5 py-4">

            {/* 제목 */}
            <FormField
              control={form.control}
              name="gthr_nm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>제목 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="예: 양재천 자유러닝" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 시작/종료일시 */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="stt_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>시작일시 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="text"
                          readOnly
                          value={field.value ? dayjs(field.value).format("YYYY-MM-DD HH:mm") : ""}
                          placeholder="연도-월-일 --:--"
                          className="cursor-pointer text-[13px]"
                          onClick={(e) => {
                            const hidden = (e.target as HTMLElement).nextElementSibling as HTMLInputElement;
                            hidden?.showPicker?.();
                            hidden?.focus();
                          }}
                        />
                        <input
                          type="datetime-local"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="sr-only"
                          tabIndex={-1}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>종료일시</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="text"
                          readOnly
                          value={field.value ? dayjs(field.value).format("YYYY-MM-DD HH:mm") : ""}
                          placeholder="연도-월-일 --:--"
                          className="cursor-pointer text-[13px]"
                          onClick={(e) => {
                            const hidden = (e.target as HTMLElement).nextElementSibling as HTMLInputElement;
                            hidden?.showPicker?.();
                            hidden?.focus();
                          }}
                        />
                        <input
                          type="datetime-local"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          className="sr-only"
                          tabIndex={-1}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 장소 */}
            <FormField
              control={form.control}
              name="loc_txt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>장소</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="예: 여의도역 9호선 B1 클룸보관함"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 유형 / 종목 / 최대 인원 */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="gthr_type_enm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>유형 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Select value={field.value ?? "general"} onValueChange={field.onChange}>
                        <SelectTrigger className="text-[13px]">
                          <SelectValue placeholder="유형" />
                        </SelectTrigger>
                        <SelectContent>
                          {GTHR_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {gthrTypeLabels[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sprt_cd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>종목 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger className="text-[13px]">
                          <SelectValue placeholder="종목" />
                        </SelectTrigger>
                        <SelectContent>
                          {GTHR_SPRT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {gthrSprtLabels[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="max_prt_cnt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>최대 인원</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="제한 없음"
                        className="text-[13px]"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 비고 */}
            <FormField
              control={form.control}
              name="desc_txt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비고</FormLabel>
                  <FormControl>
                    <textarea
                      rows={4}
                      placeholder="공지, 준비물, 링크 등 자유롭게 입력"
                      className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {rootError && (
              <p className="text-[12px] font-medium text-destructive">{rootError}</p>
            )}

            <div className="flex justify-end gap-2 pb-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? (mode === "create" ? "등록 중..." : "저장 중...")
                  : (mode === "create" ? "등록" : "저장")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
