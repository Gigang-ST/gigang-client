"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { dayjs } from "@/lib/dayjs";
import { createSchPostSchema, SCH_POST_TYPES, schPostTypeLabels, type SchPostType } from "@/lib/validations/schedule";

import {
  createSchPost,
  updateSchPost,
} from "@/app/actions/schedule/manage-sch-post";

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

const formSchema = createSchPostSchema.omit({ team_id: true }).extend({
  post_type: z.enum(SCH_POST_TYPES, { message: "유형을 선택해 주세요." }),
});
type FormValues = z.infer<typeof formSchema>;

export type SchPostFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  defaultPostType?: SchPostType;
  initialData?: {
    sch_post_id: string;
    sch_nm: string;
    post_type?: SchPostType;
    evt_stt_at: string;
    evt_end_at?: string | null;
    url?: string | null;
    cont_txt?: string | null;
    crt_by?: string | null;
  };
  onSuccess?: () => void;
};

export function SchPostFormDialog({
  open,
  onOpenChange,
  mode,
  defaultPostType,
  initialData,
  onSuccess,
}: SchPostFormDialogProps) {
  const [rootError, setRootError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sch_nm: "",
      post_type: defaultPostType,
      evt_stt_at: "",
      evt_end_at: null,
      url: null,
      cont_txt: null,
    } as FormValues,
  });

  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRootError(null);
    if (mode === "edit" && initialData) {
      form.reset({
        sch_nm: initialData.sch_nm,
        post_type: initialData.post_type ?? "general" as SchPostType,
        evt_stt_at: toDatetimeLocal(initialData.evt_stt_at),
        evt_end_at: initialData.evt_end_at ? toDatetimeLocal(initialData.evt_end_at) : null,
        url: initialData.url ?? null,
        cont_txt: initialData.cont_txt ?? null,
      });
    } else if (mode === "create") {
      form.reset({
        sch_nm: "",
        post_type: defaultPostType ?? undefined,
        evt_stt_at: initialData?.evt_stt_at ? toDateInput(initialData.evt_stt_at) : "",
        evt_end_at: null,
        url: null,
        cont_txt: null,
      });
    }
  }, [open, mode, initialData, defaultPostType, form]);

  async function onSubmit(values: FormValues) {
    setRootError(null);
    try {
      if (mode === "create") {
        await createSchPost({
          sch_nm: values.sch_nm,
          post_type: values.post_type,
          evt_stt_at: values.evt_stt_at,
          evt_end_at: values.evt_end_at ?? null,
          url: values.url ?? null,
          cont_txt: values.cont_txt ?? null,
        });
      } else {
        if (!initialData?.sch_post_id) return;
        await updateSchPost({
          sch_post_id: initialData.sch_post_id,
          sch_nm: values.sch_nm,
          post_type: values.post_type,
          evt_stt_at: values.evt_stt_at,
          evt_end_at: values.evt_end_at ?? null,
          url: values.url ?? null,
          cont_txt: values.cont_txt ?? null,
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setRootError(err instanceof Error ? err.message : "오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setRootError(null); onOpenChange(v); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0">

        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>{mode === "create" ? "정보 추가" : "정보 수정"}</DialogTitle>
        </DialogHeader>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <FormField
              control={form.control}
              name="sch_nm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>제목 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="예: 동아마라톤 접수, 나이키 슈퍼위크 등" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="evt_stt_at"
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
                name="evt_end_at"
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

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="post_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>유형 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger className="text-[13px]">
                          <SelectValue placeholder="유형을 선택해 주세요." />
                        </SelectTrigger>
                        <SelectContent>
                          {SCH_POST_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {schPostTypeLabels[type]}
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
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>링크</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://"
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

            <FormField
              control={form.control}
              name="cont_txt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>내용</FormLabel>
                  <FormControl>
                    <textarea
                      rows={4}
                      placeholder="내용을 입력해 주세요."
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

function toDatetimeLocal(isoString: string): string {
  return dayjs(isoString).format("YYYY-MM-DDTHH:mm");
}

function toDateInput(value: string): string {
  if (value.length === 10) return `${value}T00:00`;
  return toDatetimeLocal(value);
}
