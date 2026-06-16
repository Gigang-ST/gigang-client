"use client"

import { useEffect, useState } from "react"

import { ExternalLink, Pencil, Trash2 } from "lucide-react"

import { dayjs } from "@/lib/dayjs"

import { getCommentData } from "@/app/actions/comment/get-comment-data"
import { deleteSchPost } from "@/app/actions/schedule/manage-sch-post"

import type { CmntRow } from "@/components/comment/comment-item"
import { CommentSection } from "@/components/comment/comment-section"
import type { MemberOption } from "@/components/comment/mention-input"
import {
  ResponsiveDrawer,
  ResponsiveDrawerClose,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer"
import type { CalendarRace } from "@/components/home/mini-calendar"
import { Button } from "@/components/ui/button"

interface SchPostDetailDialogProps {
  post: CalendarRace | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentMemberId?: string
  isAdmin?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

export function SchPostDetailDialog({
  post,
  open,
  onOpenChange,
  currentMemberId,
  isAdmin,
  onEdit,
  onDelete,
}: SchPostDetailDialogProps) {
  const [comments, setComments] = useState<CmntRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open || !post) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getCommentData("sch_post", post.id)
      .then(({ comments, members }) => {
        console.log("[SchPostDetailDialog] comments loaded:", comments.length, comments)
        setComments(comments)
        setMembers(members)
      })
      .catch((err) => {
        console.error("[SchPostDetailDialog] getCommentData failed:", err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, post])

  async function handleDelete() {
    if (!post) return
    if (!window.confirm("이 피드를 삭제하시겠습니까?")) return
    setDeleting(true)
    try {
      await deleteSchPost(post.id)
      onOpenChange(false)
      onDelete?.()
    } finally {
      setDeleting(false)
    }
  }

  if (!post) return null

  const startAt = post.evt_stt_at ? dayjs(post.evt_stt_at) : dayjs(post.start_date)
  const endAt = post.evt_end_at ? dayjs(post.evt_end_at) : null
  const isAuthor = currentMemberId === post.crt_by

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="h-[85dvh] max-h-[85dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>{post.title}</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {startAt.format("YYYY년 M월 D일 (ddd) HH:mm")}
              {endAt && ` ~ ${endAt.format("HH:mm")}`}
            </p>

            {post.url && (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-md border border-border py-2 text-sm transition-colors hover:bg-muted"
              >
                <ExternalLink className="size-3.5" />
                링크 바로가기
              </a>
            )}

            {post.cont_txt && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.cont_txt}</p>
            )}

            {isAuthor && (
              <div className="flex gap-2 self-end">
                <Button variant="outline" size="sm" onClick={onEdit} disabled={deleting}>
                  <Pencil className="size-3.5" />
                  수정
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 className="size-3.5" />
                  {deleting ? "삭제 중..." : "삭제"}
                </Button>
              </div>
            )}

            <div className="border-t border-border pt-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">댓글 불러오는 중...</p>
              ) : (
                <CommentSection
                  entityType="sch_post"
                  entityId={post.id}
                  currentMemberId={currentMemberId}
                  isAdmin={isAdmin}
                  members={members}
                  initialComments={comments}
                />
              )}
            </div>

            <div className="mt-4 flex justify-center">
              <ResponsiveDrawerClose asChild>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
                  닫기
                </Button>
              </ResponsiveDrawerClose>
            </div>
          </div>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  )
}
