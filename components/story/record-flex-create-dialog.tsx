"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createRecordFlex } from "@/app/actions/story/create-record-flex";
import { todayKST } from "@/lib/dayjs";
import { pickQuip } from "@/lib/quips";
import { createRecordFlexSchema, POST_CMNT_MAX } from "@/lib/validations/post";

import { PhotoPicker } from "@/components/common/photo-picker";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { RequiredMark } from "@/components/common/required-mark";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { z } from "zod";

// RHF는 스키마 input 타입(default 미적용) 기준으로 동작한다
type FormValues = z.input<typeof createRecordFlexSchema>;

/**
 * 기강이야기 운동기록 작성 — 사진 한 장과 한마디로 기록을 올린다.
 *
 * **말투는 격자존(`RecordFlexFeed`)과 맞춘다 — "올린다/자랑한다".** 예전엔 이 존이
 * 코스변 팻말이라 "꽂는다"였는데, 인스타형 사진 격자 + 릴스 뷰어로 바뀌면서 코스도
 * 팻말도 없어졌다. 지금 "꽂기"라고 하면 화면에 없는 물건을 가리키는 말이 된다.
 * (팻말 어휘는 목표 한마디 존 `PledgeSigns`가 계속 쓴다 — 거긴 실제로 코스변 팻말이다.)
 *
 * **거리·종목 입력이 없다.** 이 지면의 기록은 수치를 겨루는 게 아니라 친목·응원이라
 * 사진·한마디·날짜면 충분하다. 수치가 필요한 사람은 마일리지런에 올리고, 거기에 사진을
 * 붙이면 이 지면에도 함께 뜬다 — 같은 걸 두 번 올릴 필요가 없다.
 *
 * **필수는 사진과 날짜뿐, 한마디는 선택**이다. 사진이 지면에 서는 조건이고 글은 거든다
 * (마일리지런 후기도 선택이라 두 경로 규칙이 여기서 맞는다).
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
  const [file, setFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [saving, setSaving] = useState(false);
  // 예시 문구는 열 때 한 번 뽑고 입력 중엔 고정한다 — 이 폼은 열릴 때만 마운트되므로(위 `if (!open)`)
  // 서버가 다른 문구로 그려 놓을 일이 없다
  const [quip] = useState(pickQuip);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createRecordFlexSchema),
    defaultValues: { act_dt: todayKST(), cmnt_txt: "" },
  });

  const cmnt = watch("cmnt_txt") ?? "";

  function handlePick(picked: File | null) {
    setFile(picked);
    if (picked) setPhotoError(false);
  }

  async function onSubmit(values: FormValues) {
    if (saving) return;
    // 사진은 RHF 밖이라 zod가 못 잡는다 — 필수 표시와 짝이 되게 자리에 오류를 남긴다
    if (!file) {
      setPhotoError(true);
      toast.error("사진을 한 장 올려주세요.");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("photo", file);
      fd.set("cmnt_txt", values.cmnt_txt ?? "");
      fd.set("act_dt", values.act_dt);

      const result = await createRecordFlex(fd);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      onOpenChange(false);
      router.refresh();
      toast.success("피드를 공유했어요");
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
          <ResponsiveDrawerTitle>Gingstargram</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 pb-6"
        >
          {/* 사진 — 격자 칸을 채우는 본체라 맨 위에 두고, 이 지면에 서는 유일한 조건이라 필수다 */}
          <div className="flex flex-col gap-1.5">
            <Label>
              사진
              <RequiredMark />
            </Label>
            {/* 판은 절반 폭(면적 1/4) — 꽉 찬 정사각은 375px에서 ~343px이라 사진 하나가
                폼을 다 먹고 한마디·날짜가 스크롤 밖으로 밀렸다. 고른 사진 확인엔 이만해도
                충분하고, 되찾은 높이를 아래 입력들이 쓴다.
                가운데 정렬 — 이 폼은 입력이 셋뿐이라 절반 판이 왼쪽에 붙으면 오른쪽 절반이
                통째로 비어 균형이 무너진다. 사진이 이 폼의 얼굴이니 가운데에 세운다
                (여러 칸이 줄지어 선 마일리지런 폼은 정렬선이 필요해 왼쪽 그대로 둔다). */}
            <PhotoPicker
              onPick={handlePick}
              invalid={photoError}
              size="half"
              align="center"
            />
            <Caption className={photoError ? "text-destructive" : undefined}>
              {photoError
                ? "사진을 한 장 올려주세요."
                : "사진이 있어야 기강이야기에 올라가요"}
            </Caption>
          </div>

          {/* 한마디 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-cmnt">한마디 (선택)</Label>
            <Input
              id="rf-cmnt"
              {...register("cmnt_txt")}
              maxLength={POST_CMNT_MAX}
              placeholder={quip}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
            <div className="flex items-center justify-between gap-2">
              <Caption className={errors.cmnt_txt ? "text-destructive" : undefined}>
                {/* 격자 칸은 사진만 담는다 — 한마디는 칸을 눌러 여는 릴스 뷰어에서 보인다.
                    "판에 적힌다"고 하면 격자에 글이 뜰 거라 기대하게 된다. */}
                {errors.cmnt_txt?.message ?? "사진을 누르면 함께 보여요"}
              </Caption>
              <Caption>
                {cmnt.length}/{POST_CMNT_MAX}
              </Caption>
            </div>
          </div>

          {/* 날짜 — 작성일이 아니라 뛴 날. 격자 정렬 기준이자 릴스 뷰어에 찍히는 값 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-date">
              날짜
              <RequiredMark />
            </Label>
            {/* `date-stable`은 iOS Safari에서 날짜 칸이 넘치는 걸 막는 유틸이다(globals.css).
                **폰트 크기를 같이 지정하지 않는다** — `.date-stable`이 14px로 고정하는데
                `text-[15px]` 같은 걸 덧붙이면 그 값만 덮여, 컨테이너는 14px 기준으로 잡히고
                내용은 15px로 그려져 overflow가 되살아난다(원래 이걸 고친 게 #228이다).
                옆 한마디 칸과 1px 차이는 나지만, 날짜는 어차피 서체·자간이 다른 네이티브 위젯이다. */}
            <Input
              id="rf-date"
              type="date"
              max={todayKST()}
              {...register("act_dt")}
              className="date-stable h-12 rounded-xl border-[1.5px] pr-3"
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
              {saving ? "올리는 중..." : "올리기"}
            </Button>
          </div>
        </form>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
