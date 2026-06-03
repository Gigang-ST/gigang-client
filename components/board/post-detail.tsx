"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import dayjs from "dayjs";
import type { BoardPost } from "@/lib/queries/board";
import { deletePost } from "@/app/actions/delete-post";
import { Body, Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

type PostDetailProps = {
  post: BoardPost;
  canEdit: boolean;
};

export function PostDetail({ post, canEdit }: PostDetailProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePost(post.post_id);
      router.push("/board");
      router.refresh();
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <div className="flex flex-col gap-1">
        <Body className="text-[17px] font-semibold leading-snug">{post.post_nm}</Body>
        <Caption>
          {post.writ_mem_nm ?? "관리자"} · {dayjs(post.crt_at).format("YYYY.MM.DD")}
        </Caption>
      </div>

      <Separator />

      <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
        <ReactMarkdown>{post.post_cont}</ReactMarkdown>
      </div>

      {canEdit && (
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/board/${post.post_id}/edit`}>수정</Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            삭제
          </Button>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>게시글 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            이 게시글을 삭제할까요? 삭제 후 복구할 수 없습니다.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
