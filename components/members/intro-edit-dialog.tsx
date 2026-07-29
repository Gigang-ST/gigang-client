"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { setIntroTxt } from "@/app/actions/profile/update-collection";
import { INTRO_TXT_MAX } from "@/lib/validations/member";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 한마디 인라인 편집 — 프로필 수정 화면으로 이동하지 않고 한 줄만 고친다.
 *
 * 저장은 `team_mem_rel` 직접 update(`setIntroTxt`)라 상태 이력을 남기지 않는다.
 * 저장 후 `router.refresh()`로 서버 컴포넌트를 다시 그려 내 프로필 카드에 즉시 반영한다.
 */
export function IntroEditDialog({
  open,
  onOpenChange,
  initialValue,
  onSaved,
  stacked = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: string;
  /** 저장 성공 후 호출 — 열려 있는 카드의 값을 갱신하는 용도 */
  onSaved?: (value: string) => void;
  stacked?: boolean;
}) {
  // 닫혀 있을 땐 폼을 언마운트한다 — 재진입 시 이전 편집값이 남지 않게(effect로 되돌리는 대신).
  if (!open) {
    return (
      <ResponsiveDrawer open={false} onOpenChange={onOpenChange}>
        <></>
      </ResponsiveDrawer>
    );
  }

  return (
    <IntroEditForm
      onOpenChange={onOpenChange}
      initialValue={initialValue}
      onSaved={onSaved}
      stacked={stacked}
    />
  );
}

function IntroEditForm({
  onOpenChange,
  initialValue,
  onSaved,
  stacked,
}: {
  onOpenChange: (open: boolean) => void;
  initialValue: string;
  onSaved?: (value: string) => void;
  stacked: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  const trimmed = value.trim();
  const tooLong = trimmed.length > INTRO_TXT_MAX;
  const unchanged = trimmed === initialValue.trim();

  async function handleSave() {
    if (tooLong || saving) return;
    setSaving(true);
    try {
      const result = await setIntroTxt(trimmed);
      if (!result.ok) {
        toast.error(result.message ?? "저장에 실패했습니다");
        return;
      }
      onSaved?.(trimmed);
      onOpenChange(false);
      router.refresh();
      toast.success("한마디를 저장했어요");
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
        dialogClassName={stacked ? "max-w-sm z-[70]" : "max-w-sm"}
        drawerClassName={stacked ? "z-[70]" : undefined}
        overlayClassName={stacked ? "z-[70]" : undefined}
      >
        <ResponsiveDrawerHeader className="px-4 py-4 text-left">
          <ResponsiveDrawerTitle>한마디</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-6">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={INTRO_TXT_MAX}
            placeholder="올해는 서브4 간다"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
          <div className="flex items-center justify-between gap-2">
            <Caption>내 프로필 카드에 보여요.</Caption>
            <Caption className={tooLong ? "text-destructive" : undefined}>
              {trimmed.length}/{INTRO_TXT_MAX}
            </Caption>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => void handleSave()}
              disabled={saving || tooLong || unchanged}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
