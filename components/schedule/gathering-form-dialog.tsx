"use client";

import { useEffect, useState } from "react";

import { History } from "lucide-react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { useFormPersist } from "@/lib/hooks/use-form-persist";
import { z } from "zod";

import { dayjs } from "@/lib/dayjs";
import type { RecentGathering } from "@/lib/gathering/dedupe-recent";
import { REGULAR_GATHERING_TEMPLATE } from "@/lib/gathering/templates";
import {
  GTHR_TYPES,
  GTHR_SPRT_TYPES,
  gthrTypeLabels,
  gthrSprtLabels,
  createGthrSchema,
  type CreateGthrInput,
} from "@/lib/validations/gathering";

import { createGathering, updateGathering } from "@/app/actions/gathering/manage-gathering";
import { getRecentGatherings } from "@/app/actions/gathering/get-recent-gatherings";

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

/** 등록 직후 상세를 조회 없이 즉시 열기 위한 모임 데이터(폼 입력값 + 반환 id 기반). CalendarRace 호환. */
export type CreatedGathering = {
  id: string;
  short_id: string | null;
  title: string;
  start_date: string;
  type: "gathering_mine";
  post_type: string;
  sprt_cd: string | null;
  location: string | null;
  cont_txt: string | null;
  evt_stt_at: string;
  evt_end_at: string | null;
  maxPrtCnt: number | null;
};

/** 복제("이 내용으로 새 모임") 등 등록 폼 내용 프리필. 일시는 새 모임 기준이라 제외. */
export type GatheringFormPrefill = {
  gthr_nm: string;
  gthr_type_enm: string;
  sprt_cd?: string | null;
  loc_txt?: string | null;
  desc_txt?: string | null;
  max_prt_cnt?: number | null;
};

export type GatheringFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  defaultDate?: string;
  /** create 모드 전용 내용 프리필 — 지정 시 임시저장 draft보다 우선한다 (명시적 액션이므로) */
  prefill?: GatheringFormPrefill;
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
  /** 등록(create) 성공 시 새 모임 id·데이터 전달. 수정(edit)일 땐 둘 다 undefined */
  onSuccess?: (createdGthrId?: string, createdRace?: CreatedGathering) => void | Promise<void>;
};

function toDatetimeLocal(utcIso: string) {
  return dayjs(utcIso).tz("Asia/Seoul").format("YYYY-MM-DDTHH:mm");
}

export function GatheringFormDialog({
  open,
  onOpenChange,
  mode,
  defaultDate,
  prefill,
  initialData,
  onSuccess,
}: GatheringFormDialogProps) {
  const [rootError, setRootError] = useState<string | null>(null);

  // 최근 모임 불러오기 팝업 상태. 목록은 버튼 클릭 시 1회만 조회하고 세션 동안 캐시.
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentList, setRecentList] = useState<RecentGathering[] | null>(null);
  const [recentStatus, setRecentStatus] = useState<"idle" | "loading" | "error">("idle");

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

  // dirtyFields를 구독해야 RHF가 필드 dirty 여부를 추적한다(정기 템플릿의 시작시간 보존 판정에 사용).
  const { isSubmitting, dirtyFields } = form.formState;

  const persistKey = "gathering-form-draft";
  const { clear: clearDraft } = useFormPersist(persistKey, form, open && mode === "create");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRootError(null);
    // 열릴 때마다 최근 목록 캐시 초기화 — 재진입 시 새로 등록된 모임이 반영되도록.
    setRecentOpen(false);
    setRecentList(null);
    setRecentStatus("idle");
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
      const defaultSttAt = defaultDate
        ? `${defaultDate}T${dayjs().tz("Asia/Seoul").add(1, "hour").startOf("hour").format("HH:mm")}`
        : dayjs().tz("Asia/Seoul").add(1, "hour").startOf("hour").format("YYYY-MM-DDTHH:mm");
      if (prefill) {
        // 복제 등 명시적 프리필 — draft보다 우선. 일시는 새 모임 기준으로 기본값 사용.
        form.reset({
          gthr_nm: prefill.gthr_nm,
          gthr_type_enm: prefill.gthr_type_enm as CreateGthrInput["gthr_type_enm"],
          sprt_cd: (prefill.sprt_cd ?? "running") as CreateGthrInput["sprt_cd"],
          stt_at: defaultSttAt,
          end_at: null,
          loc_txt: prefill.loc_txt ?? null,
          desc_txt: prefill.desc_txt ?? null,
          max_prt_cnt: prefill.max_prt_cnt ?? undefined,
        });
        return;
      }
      // sessionStorage 저장값이 없을 때만 기본값으로 초기화 (useFormPersist가 복원 처리)
      const hasDraft = (() => { try { return !!sessionStorage.getItem(persistKey); } catch { return false; } })();
      if (!hasDraft) {
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
  }, [open, mode, initialData, defaultDate, prefill, form, persistKey]);

  /** 유형 변경 핸들러. 정기(regular) 선택 시 비어있는 필드를 템플릿으로 채운다. */
  function handleTypeChange(value: string) {
    form.setValue("gthr_type_enm", value as FormValues["gthr_type_enm"], { shouldDirty: true });
    // 템플릿 자동 채움은 신규 등록 시에만 — 수정 중 기존 값(특히 시작 시간)을 덮지 않도록.
    if (mode !== "create" || value !== "regular") return;

    const t = REGULAR_GATHERING_TEMPLATE;
    if (!form.getValues("gthr_nm")?.trim()) {
      form.setValue("gthr_nm", t.title, { shouldDirty: true });
    }
    if (!form.getValues("desc_txt")?.trim()) {
      form.setValue("desc_txt", t.desc, { shouldDirty: true });
    }
    // 사용자가 시작 시간을 직접 건드리지 않았을 때만 정기런 기본 시각(19:30)으로. 날짜는 유지.
    if (!dirtyFields.stt_at) {
      const [hh, mm] = t.defaultTime.split(":").map(Number);
      const cur = form.getValues("stt_at");
      const base = cur ? dayjs(cur) : dayjs().tz("Asia/Seoul");
      form.setValue("stt_at", base.hour(hh).minute(mm).second(0).format("YYYY-MM-DDTHH:mm"), {
        shouldDirty: true,
      });
    }
  }

  /** "최근 모임 불러오기" 버튼: 팝업 열고 최초 1회만 조회. */
  async function openRecent() {
    setRecentOpen(true);
    // 세션 내 캐시 재사용 + 로딩 중 재클릭(팝업 닫았다 다시 열기) 중복 조회 방지
    if (recentList !== null || recentStatus === "loading") return;
    setRecentStatus("loading");
    try {
      const list = await getRecentGatherings();
      setRecentList(list);
      setRecentStatus("idle");
    } catch {
      setRecentStatus("error");
    }
  }

  /** 최근 모임 선택 → 지정 필드만 폼에 주입(일시 제외). */
  function applyRecent(g: RecentGathering) {
    form.setValue("gthr_nm", g.gthr_nm, { shouldDirty: true });
    form.setValue("gthr_type_enm", g.gthr_type_enm as FormValues["gthr_type_enm"], { shouldDirty: true });
    form.setValue("sprt_cd", (g.sprt_cd ?? "running") as FormValues["sprt_cd"], { shouldDirty: true });
    form.setValue("loc_txt", g.loc_txt ?? null, { shouldDirty: true });
    form.setValue("max_prt_cnt", g.max_prt_cnt ?? undefined, { shouldDirty: true });
    form.setValue("desc_txt", g.desc_txt ?? null, { shouldDirty: true });
    setRecentOpen(false);
  }

  async function onSubmit(values: FormValues) {
    setRootError(null);
    try {
      let createdGthrId: string | undefined;
      let createdRace: CreatedGathering | undefined;
      if (mode === "edit" && initialData) {
        await updateGathering({ gthr_id: initialData.gthr_id, ...values });
      } else {
        const result = await createGathering(values);
        createdGthrId = result.gthr_id;
        // 등록 직후 상세를 조회 없이 즉시 열 수 있도록, 입력값+반환 id로 모임 데이터를 구성해 넘긴다.
        const sttIso = dayjs.tz(values.stt_at, "Asia/Seoul").toISOString();
        const endIso = values.end_at ? dayjs.tz(values.end_at, "Asia/Seoul").toISOString() : null;
        createdRace = {
          id: result.gthr_id,
          short_id: result.short_id ?? null,
          title: values.gthr_nm,
          start_date: dayjs(sttIso).tz("Asia/Seoul").format("YYYY-MM-DD"),
          type: "gathering_mine",
          post_type: values.gthr_type_enm,
          sprt_cd: values.sprt_cd ?? null,
          location: values.loc_txt ?? null,
          cont_txt: values.desc_txt ?? null,
          evt_stt_at: sttIso,
          evt_end_at: endIso,
          maxPrtCnt: values.max_prt_cnt ?? null,
        };
      }
      clearDraft();
      onOpenChange(false);
      onSuccess?.(createdGthrId, createdRace);
    } catch (e) {
      setRootError(e instanceof Error ? e.message : "오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setRootError(null); clearDraft(); } onOpenChange(v); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>{mode === "create" ? "모임 추가" : "모임 수정"}</DialogTitle>
        </DialogHeader>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 overflow-y-auto px-5 py-4">

            {/* 최근 모임 불러오기 (등록 시에만) */}
            {mode === "create" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 self-start"
                onClick={openRecent}
                disabled={isSubmitting}
              >
                <History className="size-4" />
                최근 모임 불러오기
              </Button>
            )}

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
                      <Select value={field.value ?? "general"} onValueChange={handleTypeChange}>
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

    {/* 최근 모임 불러오기 팝업 */}
    <Dialog open={recentOpen} onOpenChange={setRecentOpen}>
      <DialogContent className="flex max-h-[70dvh] flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>최근 모임 불러오기</DialogTitle>
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
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              이전에 만든 모임이 없습니다.
            </p>
          )}
          {recentStatus === "idle" &&
            recentList?.map((g) => (
              <button
                key={g.gthr_id}
                type="button"
                onClick={() => applyRecent(g)}
                className="flex flex-col items-start gap-0.5 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted active:bg-muted"
              >
                <span className="line-clamp-1 text-[14px] font-medium text-foreground">
                  {g.gthr_nm}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {gthrTypeLabels[g.gthr_type_enm as keyof typeof gthrTypeLabels] ?? g.gthr_type_enm}
                  {" · "}
                  {dayjs(g.stt_at).tz("Asia/Seoul").format("YY.MM.DD")}
                  {g.loc_txt ? ` · ${g.loc_txt}` : ""}
                </span>
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
