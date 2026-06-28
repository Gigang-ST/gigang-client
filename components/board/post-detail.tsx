"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import dayjs from "dayjs";
import { ChevronLeft, ChevronUp } from "lucide-react";
import type { BoardPost } from "@/lib/queries/board";
import { checkBoardPermission } from "@/app/actions/check-board-permission";
import { recordBoardReadAction } from "@/app/actions/record-board-read";
import { deletePost } from "@/app/actions/delete-post";
import { Body, Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

type PostDetailProps = {
  post: BoardPost;
};

export function PostDetail({ post }: PostDetailProps) {
  const router = useRouter();
  const [canEdit, setCanEdit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    checkBoardPermission(post.writ_mem_id).then((p) => {
      setCanEdit(p.canEdit);
      if (p.memberId) recordBoardReadAction(post.post_id);
    });
  }, [post.post_id, post.writ_mem_id]);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const backHref = `/board?tab=${post.post_type_enm}`;

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePost(post.post_id);
      setDeleteOpen(false);
      router.push(backHref);
      router.refresh();
    } catch {
      alert("게시글 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* 자체 BackHeader — post_type_enm 기반으로 올바른 탭으로 복귀 */}
      <header className="sticky top-0 z-40 flex h-12 items-center border-b border-border bg-background px-4">
        <Button variant="ghost" size="icon-sm" asChild aria-label="뒤로가기">
          <Link href={backHref}>
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
      </header>
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <div className="flex flex-col gap-1">
        <Body className="text-[17px] font-semibold leading-snug">{post.post_nm}</Body>
        <Caption>
          {post.writ_mem_nm ?? "관리자"} · {dayjs(post.crt_at).format("YYYY.MM.DD")}
        </Caption>
      </div>

      <Separator />

      <div className="prose prose-sm max-w-none text-foreground dark:prose-invert [&_h1,&_h2,&_h3,&_h4]:scroll-mt-14">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>{post.post_cont}</ReactMarkdown>
      </div>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-5 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
          aria-label="맨 위로"
        >
          <ChevronUp className="size-5" />
        </button>
      )}

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
    </div>
  );
}
