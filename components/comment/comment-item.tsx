"use client"

import { useState } from "react"
import { toast } from "sonner"

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
  optimistic?: boolean
  optimisticFailed?: boolean
}

interface CommentItemProps {
  comment: CmntRow
  currentMemberId?: string
  isAdmin?: boolean
  members: MemberOption[]
  onReply?: (cmnt: CmntRow) => void
  isReply?: boolean
  /**
   * 수정 성공 — 목록을 들고 있는 쪽이 이 행을 갈아끼운다.
   *
   * ⚠️ **이 콜백이 없으면 내가 고친 댓글이 화면에서 안 바뀐다.** 예전엔 `cmnt_mst`
   * Realtime UPDATE가 돌아와 목록을 고쳐 줬는데, 그 구독을 걷어내면서(§성능 점검 C)
   * 되돌아올 경로가 없어졌다 — 수정 후 `setEditing(false)`가 원본 `comment.cont_txt`로
   * 되돌리므로 **고치기 전 내용이 그대로 남는다.**
   */
  onEdited?: (cmntId: string, contTxt: string) => void
  /**
   * 삭제 성공 — 목록을 들고 있는 쪽이 `del_yn`을 세운다(행은 남긴다).
   *
   * ⚠️ 위와 같은 이유로 필수다. 없으면 방금 지운 댓글이 그대로 보인다.
   * **목록에서 빼지 않고 `del_yn`만 세우는 것**이 규칙이다 — 시트는 이 행이 있어야
   * "삭제된 댓글입니다" 자리표시자로 스레드 맥락을 지킨다.
   */
  onDeleted?: (cmntId: string) => void
}

export function CommentItem({
  comment,
  currentMemberId,
  isAdmin,
  members,
  onReply,
  isReply,
  onEdited,
  onDeleted,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.cont_txt)
  const [loading, setLoading] = useState(false)

  const isMine = comment.mem_id === currentMemberId
  const canEdit = isMine && !comment.del_yn && !comment.has_replies
  const canDelete = (isMine || isAdmin) && !comment.del_yn && (isAdmin || !comment.has_replies)

  if (comment.del_yn) {
    return (
      <div className={`py-2 ${isReply ? "pl-10" : ""}`}>
        <Caption className="italic opacity-50">삭제된 댓글입니다.</Caption>
      </div>
    )
  }

  // 성공했을 때만 편집을 닫고 목록에 반영한다. 예전엔 결과를 아예 안 보고 무조건 닫았는데,
  // Realtime이 고쳐 주던 시절엔 실패해도 목록이 원본 그대로라 티가 안 났다. 이제는 이 콜백이
  // 유일한 반영 경로라 성공·실패를 갈라야 한다 — 실패 시 입력을 열어 둬야 쓴 글이 안 날아간다.
  // ⚠️ **두 액션은 결과 객체 대신 던질 수도 있다.** `withMember`가 세션이 없으면
  // `throw new Error("로그인이 필요합니다.")` 하고, `updateCommentSchema.parse`도 입력이
  // 어긋나면 reject한다. `finally`가 없으면 그 경로에서 `setLoading(false)`에 못 닿아
  // **버튼이 비활성인 채로 굳고 실패 메시지도 안 뜬다.**
  const handleUpdate = async () => {
    const next = editText.trim()
    if (!next) return
    setLoading(true)
    try {
      const result = await updateComment({ cmntId: comment.cmnt_id, contTxt: next, mentionedMemIds: parseMentionsFromText(next, members) })
      if (!result.ok) {
        toast(result.message ?? "댓글 수정 실패")
        return
      }
      setEditing(false)
      onEdited?.(comment.cmnt_id, next)
    } catch (err) {
      toast(err instanceof Error ? err.message : "댓글 수정 실패")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("댓글을 삭제할까요?")) return
    setLoading(true)
    try {
      const result = await deleteComment({ cmntId: comment.cmnt_id })
      if (!result.ok) {
        toast(result.message ?? "댓글 삭제 실패")
        return
      }
      onDeleted?.(comment.cmnt_id)
    } catch (err) {
      toast(err instanceof Error ? err.message : "댓글 삭제 실패")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex gap-2.5 py-2.5 ${isReply ? "pl-10" : ""}`}>
      <Avatar src={comment.avatar_url} seed={comment.mem_id} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-x-2">
          <Body className="text-sm font-semibold">{comment.mem_nm}</Body>
          {comment.optimisticFailed ? (
            <Caption className="text-xs text-destructive">전송 실패</Caption>
          ) : comment.optimistic ? (
            <Caption className="text-xs text-muted-foreground">전송 중...</Caption>
          ) : (
            <Caption className="text-xs">
              {(() => {
                const d = dayjs(comment.crt_at).tz("Asia/Seoul");
                return dayjs().tz("Asia/Seoul").diff(d, "hour") < 24
                  ? d.fromNow()
                  : d.format("YY.MM.DD");
              })()}
            </Caption>
          )}
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
