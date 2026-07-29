"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { updateRecordFlex } from "@/app/actions/story/update-record-flex";
import { pickQuip } from "@/lib/quips";
import { POST_CMNT_MAX } from "@/lib/validations/post";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { StoryPost } from "@/lib/queries/story-posts";

/**
 * 깅스타그램 한마디 수정 — 한 줄만 고친다.
 *
 * **사진은 여기서 못 바꾼다.** 갈아끼우려면 지우고 다시 올리는 게 경로다 — 사진 교체는
 * Storage 업로드·이전 파일 정리·EXIF 재처리가 줄줄이 딸려 오는데, 그건 이미 작성 폼이
 * 하는 일이라 편집에 한 벌 더 만들 이유가 없다. 날짜도 뺐다(포인트 트리거가 도는 값 —
 * §updateRecordFlex).
 *
 * 삭제 다이얼로그(`RecordDeleteDialog`)와 **같은 시그니처**(`post`)를 쓴다: 두 진입점이
 * 릴스 상단바에 나란히 서므로 부모가 같은 모양으로 상태를 들고 있는 게 맞다.
 *
 * 릴스(z-50) 위에 뜬다 — `stacked`로 z-[70]까지 올린다(프로필 카드·한마디 편집과 같은 처리).
 */
export function RecordFlexEditDialog({
  post,
  open,
  onOpenChange,
  onSaved,
  stacked = true,
}: {
  /** null이면 닫힌 상태 */
  post: StoryPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 저장 성공 후 — 열려 있는 릴스의 한마디를 그 자리에서 갈아끼우는 용도.
   *
   * `router.refresh()`만으로는 부족하다: 더보기로 이어붙인 기록(`extra`)이나 딥링크 단건은
   * **클라이언트 상태**라 서버 재조회가 닿지 않아, 방금 고친 한마디가 릴스에 옛 값으로 남는다.
   */
  onSaved?: (postId: string, cmntTxt: string | null) => void;
  stacked?: boolean;
}) {
  // 닫혀 있을 땐 폼을 언마운트한다 — 재진입 시 이전 편집값이 남지 않게(effect로 되돌리는 대신).
  // 다른 장을 열었을 때 앞 장의 한마디가 그대로 떠 있는 걸 막는 것도 겸한다.
  if (!open || !post) {
    return (
      <ResponsiveDrawer open={false} onOpenChange={onOpenChange}>
        <></>
      </ResponsiveDrawer>
    );
  }

  return (
    <RecordFlexEditForm
      // post_id를 key로 줘서 장이 바뀌면 폼이 새로 선다(초기값이 그 장의 한마디가 되게).
      key={post.post_id}
      post={post}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      stacked={stacked}
    />
  );
}

function RecordFlexEditForm({
  post,
  onOpenChange,
  onSaved,
  stacked,
}: {
  post: StoryPost;
  onOpenChange: (open: boolean) => void;
  onSaved?: (postId: string, cmntTxt: string | null) => void;
  stacked: boolean;
}) {
  const router = useRouter();
  const initialValue = post.cmnt_txt ?? "";
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  // 예시 문구는 작성 폼과 같은 풀에서 뽑는다 — 한마디를 지우고 다시 쓸 때 빈 칸이 되는데,
  // 그 자리에 안내문("한마디를 남겨보세요")만 서 있으면 작성 때와 톤이 갈린다.
  // 열 때 한 번 뽑고 고정한다: 이 폼은 `key={post_id}`로 마운트되므로 장이 바뀔 때만 새로 뽑힌다.
  const [quip] = useState(pickQuip);

  const trimmed = value.trim();
  const tooLong = trimmed.length > POST_CMNT_MAX;
  const unchanged = trimmed === initialValue.trim();
  const fromMileage = post.src_enm === "mlg_auto";

  async function handleSave() {
    if (tooLong || saving) return;
    setSaving(true);
    try {
      const result = await updateRecordFlex({
        post_id: post.post_id,
        cmnt_txt: trimmed,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // 서버 값과 같은 모양으로 넘긴다 — 빈 한마디는 null(§updateRecordFlex).
      onSaved?.(post.post_id, trimmed.length > 0 ? trimmed : null);
      onOpenChange(false);
      router.refresh();
      toast.success("한마디를 수정했어요");
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
          <ResponsiveDrawerTitle>한마디 수정</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-6">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={POST_CMNT_MAX}
            placeholder={quip}
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
            {/* 유입분은 원본(마일리지런 후기)을 고치는 것이라 그쪽도 함께 바뀐다 —
                누르기 전에 알린다(공개된 두 지면이 같이 움직이므로). */}
            <Caption>
              {fromMileage
                ? "마일리지런 후기도 함께 바뀌어요."
                : "사진을 누르면 함께 보여요."}
            </Caption>
            <Caption className={tooLong ? "text-destructive" : undefined}>
              {trimmed.length}/{POST_CMNT_MAX}
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
