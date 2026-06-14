"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Calendar, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  createSchPost,
  deleteSchPost,
  updateSchPost,
} from "@/app/actions/schedule/manage-sch-post";
import { dayjs } from "@/lib/dayjs";
import { createSchPostSchema, SCH_POST_TYPES, schPostTypeLabels, type SchPostType } from "@/lib/validations/schedule";

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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = createSchPostSchema.omit({ team_id: true }).extend({
  post_type: z.enum(SCH_POST_TYPES),
});
type FormValues = z.infer<typeof formSchema>;

export type SchPostFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "view" | "edit";
  defaultPostType?: SchPostType;
  currentMemberId?: string;
  isAdmin?: boolean;
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
  mode: initialMode,
  defaultPostType = "general",
  currentMemberId,
  isAdmin,
  initialData,
  onSuccess,
}: SchPostFormDialogProps) {
  const [mode, setMode] = useState(initialMode);
  const [rootError, setRootError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = isAdmin || (!!currentMemberId && currentMemberId === initialData?.crt_by);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sch_nm: "",
      post_type: defaultPostType,
      evt_stt_at: "",
      evt_end_at: null,
      url: null,
      cont_txt: null,
    },
  });

  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setRootError(null);
    if (initialMode === "edit" && initialData) {
      form.reset({
        sch_nm: initialData.sch_nm,
        post_type: initialData.post_type ?? "general",
        evt_stt_at: toDatetimeLocal(initialData.evt_stt_at),
        evt_end_at: initialData.evt_end_at ? toDatetimeLocal(initialData.evt_end_at) : null,
        url: initialData.url ?? null,
        cont_txt: initialData.cont_txt ?? null,
      });
    } else if (initialMode === "create") {
      form.reset({
        sch_nm: "",
        post_type: defaultPostType,
        evt_stt_at: initialData?.evt_stt_at ? toDateInput(initialData.evt_stt_at) : "",
        evt_end_at: null,
        url: null,
        cont_txt: null,
      });
    }
  }, [open, initialMode, initialData, form]);

  function startEditing() {
    form.reset({
      sch_nm: initialData?.sch_nm ?? "",
      post_type: initialData?.post_type ?? "general",
      evt_stt_at: initialData?.evt_stt_at ? toDatetimeLocal(initialData.evt_stt_at) : "",
      evt_end_at: initialData?.evt_end_at ? toDatetimeLocal(initialData.evt_end_at) : null,
      url: initialData?.url ?? null,
      cont_txt: initialData?.cont_txt ?? null,
    });
    setRootError(null);
    setMode("edit");
  }

  async function onSubmit(values: FormValues) {
    setRootError(null);
    try {
      if (initialMode === "create") {
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

  async function handleDelete() {
    if (!initialData?.sch_post_id) return;
    const confirmed = window.confirm("이 소식을 삭제하시겠습니까?");
    if (!confirmed) return;
    setDeleting(true);
    setRootError(null);
    try {
      await deleteSchPost(initialData.sch_post_id);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setRootError(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
      setDeleting(false);
    }
  }

  const titleMap = { create: "소식 추가", view: initialData?.sch_nm ?? "소식", edit: "소식 수정" };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setMode(initialMode); setDeleting(false); } onOpenChange(v); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0">

        {/* 헤더 */}
        <DialogHeader className="px-5 pb-3 pt-5">
          {mode === "edit" && initialMode === "view" && (
            <button
              onClick={() => setMode("view")}
              className="mb-1 flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground w-fit"
            >
              <ArrowLeft className="size-3" />
              돌아가기
            </button>
          )}
          <DialogTitle className="truncate">{titleMap[mode]}</DialogTitle>
        </DialogHeader>

        <Separator />

        {/* 상세 보기 */}
        {mode === "view" && initialData && (
          <div className="flex flex-col overflow-y-auto">
            {/* 메타 정보 영역 */}
            <div className="flex flex-col gap-3 px-5 py-4">
              {/* 유형 + 날짜 */}
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-info/10 px-2.5 py-0.5 text-[11px] font-semibold text-info">
                  {schPostTypeLabels[initialData.post_type ?? "general"]}
                </span>
                <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Calendar className="size-3" />
                  {dayjs(initialData.evt_stt_at).format("M월 D일 (ddd) HH:mm")}
                  {initialData.evt_end_at && (
                    <> ~ {dayjs(initialData.evt_end_at).format("M월 D일 (ddd) HH:mm")}</>
                  )}
                </span>
              </div>

              {/* 링크 바로가기 */}
              {initialData.url && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 rounded-lg text-[13px]"
                  onClick={() => window.open(initialData.url!, "_blank")}
                >
                  <ExternalLink className="size-3.5" />
                  링크 바로가기
                </Button>
              )}
            </div>

            {/* 내용 */}
            {initialData.cont_txt && (
              <>
                <Separator />
                <div className="px-5 py-4">
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                    {initialData.cont_txt}
                  </p>
                </div>
              </>
            )}

            {rootError && (
              <p className="px-5 text-[12px] font-medium text-destructive">{rootError}</p>
            )}

            {/* 하단 액션 */}
            {canEdit && (
              <>
                <Separator />
                <div className="flex gap-2 px-5 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={startEditing}
                    disabled={deleting}
                  >
                    <Pencil className="size-3.5" />
                    수정
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 className="size-3.5" />
                    {deleting ? "삭제 중..." : "삭제"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 등록/수정 폼 */}
        {(mode === "create" || mode === "edit") && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
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

              {/* 시작일시 / 종료일시 */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="evt_stt_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>시작일시 <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input type="datetime-local" className="text-[13px]" {...field} value={field.value ?? ""} />
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
                        <Input
                          type="datetime-local"
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

              {/* 유형 / 링크 */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="post_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>유형</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="text-[13px]">
                            <SelectValue />
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
        )}
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

// "2026-06-14" (날짜만) → "2026-06-14T00:00", ISO 형식이면 toDatetimeLocal로 변환
function toDateInput(value: string): string {
  if (value.length === 10) return `${value}T00:00`;
  return toDatetimeLocal(value);
}
