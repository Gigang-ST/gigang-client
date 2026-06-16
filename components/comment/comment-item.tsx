"use client"

import { useState } from "react"

import { dayjs } from "@/lib/dayjs"

import { updateComment, deleteComment } from "@/app/actions/comment/manage-comment"

import { Avatar } from "@/components/common/avatar"
import { Body, Caption } from "@/components/common/typography"
import { Button } from "@/components/ui/button"

import { MentionInput, parseMentionsFromText, renderMentions, type MemberOption } from "./mention-input"

export type CmntRow = {
  cmnt_id: string
  prnt_id: string | null
  mem_id: string
  mem_nm: string
  avatar_url?: string | null
  cont_txt: string
  edit_yn: boolean
  del_yn: boolean
  crt_at: string
  upd_at: string
  has_replies?: boolean
}

interface CommentItemProps {
  comment: CmntRow
  currentMemberId?: string
  isAdmin?: boolean
  members: MemberOption[]
  onReply?: (cmnt: CmntRow) => void
  isReply?: boolean
}

export function CommentItem({
  comment,
  currentMemberId,
  isAdmin,
  members,
  onReply,
  isReply,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.cont_txt)
  const [loading, setLoading] = useState(false)

  const isMine = comment.mem_id === currentMemberId
  const canEdit = isMine && !comment.del_yn && !comment.has_replies
  const canDelete = (isMine || isAdmin) && !comment.del_yn && !comment.has_replies

  if (comment.del_yn) {
    return (
      <div className={`py-2 ${isReply ? "pl-10" : ""}`}>
        <Caption className="italic opacity-50">삭제된 댓글입니다.</Caption>
      </div>
    )
  }

  const handleUpdate = async () => {
    if (!editText.trim()) return
    setLoading(true)
    await updateComment({ cmntId: comment.cmnt_id, contTxt: editText.trim(), mentionedMemIds: parseMentionsFromText(editText.trim(), members) })
    setLoading(false)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm("댓글을 삭제할까요?")) return
    setLoading(true)
    await deleteComment({ cmntId: comment.cmnt_id })
    setLoading(false)
  }

  return (
    <div className={`flex gap-2.5 py-2.5 ${isReply ? "pl-10" : ""}`}>
      <Avatar src={comment.avatar_url} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-x-2">
          <Body className="text-sm font-semibold">{comment.mem_nm}</Body>
          <Caption className="text-xs">{dayjs(comment.crt_at).fromNow()}</Caption>
          {comment.edit_yn && <Caption className="text-xs opacity-60">(수정됨)</Caption>}
          {!editing && (
            <div className="ml-auto flex gap-3">
              {onReply && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => onReply(comment)}
                >
                  답글
                </button>
              )}
              {canEdit && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setEditing(true)}
                >
                  수정
                </button>
              )}
              {canDelete && (
                <button
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  삭제
                </button>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2">
            <MentionInput
              value={editText}
              onChange={setEditText}
              members={members}
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate} disabled={loading || !editText.trim()}>
                저장
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setEditing(false); setEditText(comment.cont_txt) }}
              >
                취소
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-sm leading-relaxed break-words">
            {renderMentions(comment.cont_txt, members)}
          </p>
        )}

      </div>
    </div>
  )
}
