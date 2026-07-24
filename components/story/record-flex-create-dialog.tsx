"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createRecordFlex } from "@/app/actions/story/create-record-flex";
import { todayKST } from "@/lib/dayjs";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
import {
  createRecordFlexSchema,
  POST_CMNT_MAX,
  POST_PHOTO_MAX_BYTES,
  POST_PHOTO_TYPES,
  POST_SPRT_KEYS,
} from "@/lib/validations/post";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { z } from "zod";

// RHF는 스키마 input 타입(default 미적용) 기준으로 동작한다
type FormValues = z.input<typeof createRecordFlexSchema>;

/**
 * 기록 자랑 작성 — 사진 한 장과 한마디로 팻말을 세운다.
 *
 * 사진은 RHF 밖의 `useState`로 관리한다. `File`은 zod로 검증하기 번거롭고(브라우저 전용 타입),
 * 실제 강제는 어차피 서버 액션이 크기·타입을 다시 보기 때문이다 — 여기서는 즉시 피드백만 준다.
 * 제출 시 텍스트 필드와 파일을 `FormData`로 합쳐 넘긴다.
 */
export function RecordFlexCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // 닫혀 있으면 폼을 통째로 언마운트한다 — 재진입 시 이전 입력·미리보기가 남지 않게
  if (!open) {
    return (
      <ResponsiveDrawer open={false} onOpenChange={onOpenChange}>
        <></>
      </ResponsiveDrawer>
    );
  }
  return <RecordFlexCreateForm onOpenChange={onOpenChange} />;
}

function RecordFlexCreateForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createRecordFlexSchema),
    defaultValues: { act_dt: todayKST(), sprt_enm: "RUNNING", cmnt_txt: "" },
  });

  const sprt = watch("sprt_enm");
  const cmnt = watch("cmnt_txt") ?? "";

  // 미리보기 objectURL은 브라우저가 자동으로 회수하지 않는다 — 교체·언마운트 때 직접 해제
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.size > POST_PHOTO_MAX_BYTES) {
      toast.error("사진은 10MB 이하만 가능합니다.");
      return;
    }
    if (!POST_PHOTO_TYPES.includes(picked.type)) {
      toast.error("JPG, PNG, WebP, HEIC 형식만 가능합니다.");
      return;
    }
    setFile(picked);
  }

  async function onSubmit(values: FormValues) {
    if (saving) return;
    if (!file) {
      toast.error("사진을 한 장 올려주세요.");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("photo", file);
      fd.set("cmnt_txt", values.cmnt_txt);
      fd.set("dst_km", String(values.dst_km));
      fd.set("sprt_enm", values.sprt_enm);
      fd.set("act_dt", values.act_dt);

      const result = await createRecordFlex(fd);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      onOpenChange(false);
      router.refresh();
      toast.success("기록을 코스에 꽂았어요");
    } catch {
      toast.error("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDrawer open onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        className="flex flex-col gap-0"
        dialogClassName="max-w-sm"
      >
        <ResponsiveDrawerHeader className="px-4 py-4 text-left">
          <ResponsiveDrawerTitle>기록 팻말 세우기</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 pb-6"
        >
          {/* 사진 — 팻말 판의 본체라 맨 위에 둔다 */}
          <div className="flex flex-col gap-1.5">
            <Label>사진</Label>
            <input
              ref={fileRef}
              type="file"
              accept={POST_PHOTO_TYPES.join(",")}
              onChange={handlePick}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-border bg-muted/30 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {preview ? (
                <Image
                  src={preview}
                  alt="올릴 사진 미리보기"
                  width={480}
                  height={480}
                  className="size-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImagePlus className="size-7" />
                  <span className="text-[13px]">사진 한 장 고르기</span>
                </span>
              )}
            </button>
          </div>

          {/* 한마디 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-cmnt">한마디</Label>
            <Input
              id="rf-cmnt"
              {...register("cmnt_txt")}
              maxLength={POST_CMNT_MAX}
              placeholder="오늘 페이스 좋았다"
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
            <div className="flex items-center justify-between gap-2">
              <Caption className={errors.cmnt_txt ? "text-destructive" : undefined}>
                {errors.cmnt_txt?.message ?? "팻말 판에 적혀 모두에게 보여요."}
              </Caption>
              <Caption>
                {cmnt.length}/{POST_CMNT_MAX}
              </Caption>
            </div>
          </div>

          {/* 종목 · 거리 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rf-sprt">종목</Label>
              <Select
                value={sprt}
                onValueChange={(v) =>
                  setValue("sprt_enm", v as FormValues["sprt_enm"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="rf-sprt" className="h-12 rounded-xl border-[1.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_SPRT_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {MILEAGE_SPORT_LABELS[k as MileageSport]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rf-dst">거리 (km)</Label>
              <Input
                id="rf-dst"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                {...register("dst_km", { valueAsNumber: true })}
                placeholder="10.2"
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>
          </div>
          {errors.dst_km && (
            <Caption className="text-destructive">{errors.dst_km.message}</Caption>
          )}

          {/* 날짜 — 작성일이 아니라 뛴 날. 팻말 하단에 이 값이 찍힌다 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-date">날짜</Label>
            <Input
              id="rf-date"
              type="date"
              max={todayKST()}
              {...register("act_dt")}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
            {errors.act_dt && (
              <Caption className="text-destructive">{errors.act_dt.message}</Caption>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "꽂는 중..." : "꽂기"}
            </Button>
          </div>
        </form>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
