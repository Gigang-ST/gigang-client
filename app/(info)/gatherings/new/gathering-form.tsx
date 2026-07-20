"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { dayjs } from "@/lib/dayjs";
import { isImminentGathering } from "@/lib/gathering/imminent";
import { GTHR_TYPES, gthrTypeLabels, createGthrSchema, type CreateGthrInput } from "@/lib/validations/gathering";

import { createGathering, updateGathering } from "@/app/actions/gathering/manage-gathering";

import { Button } from "@/components/ui/button";
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
import { AutoGrowTextarea } from "@/components/common/auto-grow-textarea";
import { Caption } from "@/components/common/typography";

const formSchema = createGthrSchema.omit({ team_id: true });
type FormValues = z.infer<typeof formSchema>;

type Props = {
  mode: "create";
} | {
  mode: "edit";
  initialData: {
    gthr_id: string;
    gthr_nm: string;
    gthr_type_enm: string;
    stt_at: string;
    end_at?: string | null;
    loc_txt?: string | null;
    desc_txt?: string | null;
    max_prt_cnt?: number | null;
  };
  onSuccess?: () => void;
};

function toDatetimeLocal(utcIso: string) {
  return dayjs(utcIso).tz("Asia/Seoul").format("YYYY-MM-DDTHH:mm");
}

export function GatheringForm(props: Props) {
  const router = useRouter();
  const [rootError, setRootError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues:
      props.mode === "edit"
        ? {
            gthr_nm: props.initialData.gthr_nm,
            gthr_type_enm: props.initialData.gthr_type_enm as CreateGthrInput["gthr_type_enm"],
            stt_at: toDatetimeLocal(props.initialData.stt_at),
            end_at: props.initialData.end_at ? toDatetimeLocal(props.initialData.end_at) : null,
            loc_txt: props.initialData.loc_txt ?? "",
            desc_txt: props.initialData.desc_txt ?? "",
            max_prt_cnt: props.initialData.max_prt_cnt ?? undefined,
          }
        : {
            gthr_type_enm: "general",
            gthr_nm: "",
            stt_at: dayjs().tz("Asia/Seoul").add(1, "hour").startOf("hour").format("YYYY-MM-DDTHH:mm"),
            end_at: null,
            loc_txt: "",
            desc_txt: "",
          },
  });

  const { isSubmitting } = form.formState;

  // 시작까지 12시간 미만이면 정보성 안내 노출 — 개설을 막지는 않는다.
  const sttAt = form.watch("stt_at");
  const isImminent = isImminentGathering(sttAt);

  useEffect(() => {
    if (props.mode !== "edit") return;
    form.reset({
      gthr_nm: props.initialData.gthr_nm,
      gthr_type_enm: props.initialData.gthr_type_enm as CreateGthrInput["gthr_type_enm"],
      stt_at: toDatetimeLocal(props.initialData.stt_at),
      end_at: props.initialData.end_at ? toDatetimeLocal(props.initialData.end_at) : null,
      loc_txt: props.initialData.loc_txt ?? "",
      desc_txt: props.initialData.desc_txt ?? "",
      max_prt_cnt: props.initialData.max_prt_cnt ?? undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode === "edit" && props.initialData.gthr_id]);

  async function onSubmit(values: FormValues) {
    setRootError(null);
    try {
      if (props.mode === "edit") {
        await updateGathering({ gthr_id: props.initialData.gthr_id, ...values });
        props.onSuccess?.();
      } else {
        const result = await createGathering(values);
        if ("gthr_id" in result) {
          router.push(`/gatherings/${result.gthr_id}`);
        }
      }
    } catch (e) {
      setRootError(e instanceof Error ? e.message : "오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">

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

        {/* 임박 개설 안내 — 정보성, 제출은 막지 않음 */}
        {isImminent && (
          <div className="flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2">
            <Info className="mt-0.5 size-4 shrink-0 text-info" />
            <Caption className="text-info">
              시작까지 12시간이 채 남지 않았어요. 당일에 오픈한 일정은 참석자가 없을 수 있어요.
            </Caption>
          </div>
        )}

        {/* 장소 */}
        <FormField
          control={form.control}
          name="loc_txt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>장소</FormLabel>
              <FormControl>
                <Input placeholder="예: 여의도역 9호선 B1 클룸보관함" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 유형 / 최대 인원 */}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="gthr_type_enm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>유형 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value ?? "general"}>
                    <SelectTrigger className="text-[13px]">
                      <SelectValue placeholder="유형 선택" />
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

        {/* 내용 */}
        <FormField
          control={form.control}
          name="desc_txt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>내용</FormLabel>
              <FormControl>
                <AutoGrowTextarea
                  placeholder="공지, 준비물, 링크 등 자유롭게 입력"
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
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting
              ? (props.mode === "edit" ? "저장 중..." : "등록 중...")
              : (props.mode === "edit" ? "저장" : "모임 만들기")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
