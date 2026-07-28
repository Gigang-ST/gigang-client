"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { deleteRecordFlex } from "@/app/actions/story/delete-record-flex";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { StoryPost } from "@/lib/queries/story-posts";

/**
 * 운동기록 삭제 확인 — 격자 길게누르기와 릴스 ⋮ 메뉴가 **함께 쓴다**.
 *
 * 진입점이 둘이라 다이얼로그를 각자 만들면 문구·처리 순서가 갈린다(특히 마일리지런 유입분
 * 안내는 한쪽만 빠뜨리기 쉽다). 두 곳이 이 하나를 열고, 무엇을 지우는지는 `post`가 말한다.
 *
 * **마일리지런에서 온 기록은 다르게 안내한다.** 지운다는 건 원본에서 사진을 뗀다는 뜻이라
 * (§`deleteRecordFlex`), 사용자가 "마일리지런 기록까지 사라지나" 하고 멈칫하지 않게
 * 무엇이 남고 무엇이 사라지는지 먼저 말한다 — 공개 취소는 되돌리기 어려워 사후 안내로는 늦다.
 *
 * 성공하면 `router.refresh()`로 서버 데이터를 다시 받는다. 액션이 `updateTag`를 이미
 * 불렀으므로 새 캐시가 내려온다(낙관적 제거를 하지 않는 이유 — 격자·릴스·리드가 같은
 * 목록을 보고 있어 한 곳만 손으로 지우면 나머지가 어긋난다).
 */
export function RecordDeleteDialog({
  post,
  open,
  onOpenChange,
  onDeleted,
}: {
  /** 지울 기록 — null이면 닫힌 상태 */
  post: StoryPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 삭제 성공 직후 — 릴스 뷰어는 이걸로 자기 자신을 닫는다 */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromMileage = post?.src_enm === "mlg_auto";

  async function handleDelete() {
    if (!post) return;
    setDeleting(true);
    setError(null);

    const result = await deleteRecordFlex(post.post_id);

    setDeleting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    onOpenChange(false);
    onDeleted?.();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 지우는 중엔 닫히지 않게 — 요청이 날아가는 사이 닫으면 결과를 못 알린다.
        if (deleting) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>사진 삭제</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {fromMileage ? (
            <>
              마일리지런에서 올린 사진이에요. 삭제하면 <b className="text-foreground">사진만</b>{" "}
              지워지고 거리·후기는 마일리지런에 그대로 남아요.
            </>
          ) : (
            <>이 사진을 삭제할까요? 한마디도 함께 지워지고 되돌릴 수 없어요.</>
          )}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            취소
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
