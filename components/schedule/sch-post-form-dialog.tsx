"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  createSchPost,
  deleteSchPost,
  updateSchPost,
} from "@/app/actions/schedule/manage-sch-post";
import { createSchPostSchema } from "@/lib/validations/schedule";

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

const formSchema = createSchPostSchema.omit({ team_id: true });
type FormValues = z.infer<typeof formSchema>;

export type SchPostFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialData?: {
    sch_post_id: string;
    sch_nm: string;
    evt_stt_at: string;
    evt_end_at?: string | null;
    url?: string | null;
    cont_txt?: string | null;
  };
  onSuccess?: () => void;
};

export function SchPostFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSuccess,
}: SchPostFormDialogProps) {
  const [rootError, setRootError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sch_nm: "",
      evt_stt_at: "",
      evt_end_at: null,
      url: null,
      cont_txt: null,
    },
  });

  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (!open) return;
    setRootError(null);
    if (mode === "edit" && initialData) {
      form.reset({
        sch_nm: initialData.sch_nm,
        evt_stt_at: toDatetimeLocal(initialData.evt_stt_at),
        evt_end_at: initialData.evt_end_at ? toDatetimeLocal(initialData.evt_end_at) : null,
        url: initialData.url ?? null,
        cont_txt: initialData.cont_txt ?? null,
      });
    } else {
      form.reset({
        sch_nm: "",
        evt_stt_at: initialData?.evt_stt_at ?? "",
        evt_end_at: null,
        url: null,
        cont_txt: null,
      });
    }
  }, [open, mode, initialData, form]);

  async function onSubmit(values: FormValues) {
    setRootError(null);
    try {
      if (mode === "create") {
        await createSchPost({
          sch_nm: values.sch_nm,
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

  async function handleDelete() {
    if (!initialData?.sch_post_id) return;
    const confirmed = window.confirm("이 일정을 삭제하시겠습니까?");
    if (!confirmed) return;
    setRootError(null);
    try {
      await deleteSchPost(initialData.sch_post_id);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setRootError(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "일정 수정" : "일정 추가"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* 일정명 */}
            <FormField
              control={form.control}
              name="sch_nm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>일정명 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="일정명을 입력해 주세요." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 시작 일시 */}
            <FormField
              control={form.control}
              name="evt_stt_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>시작 일시 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 종료 일시 */}
            <FormField
              control={form.control}
              name="evt_end_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>종료 일시</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* URL */}
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
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 내용 */}
            <FormField
              control={form.control}
              name="cont_txt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>내용</FormLabel>
                  <FormControl>
                    <textarea
                      rows={4}
                      placeholder="일정에 대한 내용을 입력해 주세요."
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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
              <p className="text-sm font-medium text-destructive">{rootError}</p>
            )}

            {isEdit ? (
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                  삭제
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                    취소
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "저장 중..." : "저장하기"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  취소
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "등록 중..." : "등록하기"}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// "2026-06-11T07:00:00+09:00" → "2026-06-11T07:00" (datetime-local input 형식)
function toDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
