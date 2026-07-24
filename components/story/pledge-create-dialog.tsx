"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { createPledge } from "@/app/actions/story/create-pledge";
import { PLEDGE_TXT_MAX } from "@/lib/validations/pledge";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 입력 상한 — Zod 스키마와 동일(견인 배너 한 줄에 맞춘 길이) */
const PLEDGE_MAX = PLEDGE_TXT_MAX;

/**
 * 각오 작성 — 코스에 꽂을 한 줄 다짐을 남긴다.
 *
 * 저장은 `createPledge` 서버 액션(→ `pldg_mst` insert + `revalidateTag("story-feed")`).
 * 저장 후 `router.refresh()`로 전광판을 다시 그려 새 팻말이 바로 코스에 서게 한다.
 * IntroEditDialog와 같은 인라인 편집 패턴 — 페이지 이동 없이 한 줄만 받는다.
 *
 * 각오에는 만료가 없다 — 24시간 규칙은 종이비행기 한마디(MessageCreateDialog) 것이다.
 */
export function PledgeCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 저장 성공 후 호출 — 낙관적 추가 등에 쓸 수 있게 텍스트를 넘긴다 */
  onCreated?: (text: string) => void;
}) {
  // 닫혀 있을 땐 폼을 언마운트한다 — 재진입 시 이전 입력이 남지 않게.
  if (!open) {
    return (
      <ResponsiveDrawer open={false} onOpenChange={onOpenChange}>
        <></>
      </ResponsiveDrawer>
    );
  }

  return (
    <PledgeCreateForm onOpenChange={onOpenChange} onCreated={onCreated} />
  );
}

function PledgeCreateForm({
  onOpenChange,
  onCreated,
}: {
  onOpenChange: (open: boolean) => void;
  onCreated?: (text: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const trimmed = value.trim();
  const tooLong = trimmed.length > PLEDGE_MAX;
  const empty = trimmed.length === 0;

  async function handleSave() {
    if (empty || tooLong || saving) return;
    setSaving(true);
    try {
      const result = await createPledge({ pldg_txt: trimmed });
      if (!result.ok) {
        toast.error(result.message ?? "저장에 실패했습니다");
        return;
      }
      onCreated?.(trimmed);
      onOpenChange(false);
      router.refresh();
      toast.success("각오를 코스에 꽂았어요");
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
          <ResponsiveDrawerTitle>각오 팻말 꽂기</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-6">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={PLEDGE_MAX}
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
            <Caption>코스변에 팻말로 서서 모두에게 보여요.</Caption>
            <Caption className={tooLong ? "text-destructive" : undefined}>
              {trimmed.length}/{PLEDGE_MAX}
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
              disabled={saving || empty || tooLong}
            >
              {saving ? "꽂는 중..." : "꽂기"}
            </Button>
          </div>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
