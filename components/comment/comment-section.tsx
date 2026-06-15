"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { SectionLabel } from "@/components/common/typography"
import { Button } from "@/components/ui/button"
import { CommentItem, type CmntRow } from "./comment-item"
import { MentionInput, type MemberOption } from "./mention-input"
import { createComment } from "@/app/actions/comment/manage-comment"

interface CommentSectionProps {
  entityType: "sch_post" | "comp" | "gathering"
  entityId: string
  currentMemberId?: string
  isAdmin?: boolean
  members: MemberOption[]
  initialComments: CmntRow[]
}

type CommentWithReplies = CmntRow & { replies: CmntRow[] }

function buildTree(flat: CmntRow[]): CommentWithReplies[] {
  const replyParentIds = new Set(
    flat.filter((c) => c.prnt_id && !c.del_yn).map((c) => c.prnt_id as string)
  )
  return flat
    .filter((c) => !c.prnt_id)
    .map((c) => ({
      ...c,
      has_replies: replyParentIds.has(c.cmnt_id),
      replies: flat
        .filter((r) => r.prnt_id === c.cmnt_id)
        .map((r) => ({ ...r, replies: [] })),
    }))
}

export function CommentSection({
  entityType,
  entityId,
  currentMemberId,
  isAdmin,
  members,
  initialComments,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CmntRow[]>(initialComments)
  const [newText, setNewText] = useState("")
  const [newMentions, setNewMentions] = useState<string[]>([])
  const [replyTo, setReplyTo] = useState<CmntRow | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`cmnt:${entityType}:${entityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cmnt_mst",
          filter: `entity_id=eq.${entityId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as CmntRow
            setComments((prev) => {
              if (prev.some((c) => c.cmnt_id === incoming.cmnt_id)) return prev
              const mem = members.find((m) => m.mem_id === incoming.mem_id)
              return [...prev, { ...incoming, mem_nm: mem?.mem_nm ?? "멤버" }]
            })
          } else if (payload.eventType === "UPDATE") {
            setComments((prev) =>
              prev.map((c) =>
                c.cmnt_id === (payload.new as CmntRow).cmnt_id
                  ? { ...c, ...(payload.new as CmntRow) }
                  : c
              )
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [entityType, entityId, supabase, members])

  const handleSubmit = async () => {
    if (!newText.trim() || !currentMemberId) return
    setLoading(true)
    try {
      const result = await createComment({
        entityType,
        entityId,
        contTxt: newText.trim(),
        prntId: replyTo?.cmnt_id,
        mentionedMemIds: newMentions,
      })
      if (result.ok) {
        const me = members.find((m) => m.mem_id === currentMemberId)
        setComments((prev) => [
          ...prev,
          {
            cmnt_id: result.data.cmnt_id,
            prnt_id: result.data.prnt_id,
            mem_id: result.data.mem_id,
            mem_nm: me?.mem_nm ?? "나",
            avatar_url: null,
            cont_txt: result.data.cont_txt,
            edit_yn: result.data.edit_yn,
            del_yn: result.data.del_yn,
            crt_at: result.data.crt_at,
            upd_at: result.data.upd_at,
          },
        ])
        setNewText("")
        setNewMentions([])
        setReplyTo(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const visibleCount = comments.filter((c) => !c.del_yn).length
  const tree = buildTree(comments)

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>
        {`COMMENTS${visibleCount > 0 ? ` · ${visibleCount}` : ""}`}
      </SectionLabel>

      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">아직 댓글이 없습니다.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {tree.map((cmnt) => (
            <div key={cmnt.cmnt_id}>
              <CommentItem
                comment={cmnt}
                currentMemberId={currentMemberId}
                isAdmin={isAdmin}
                members={members}
                onReply={currentMemberId ? setReplyTo : undefined}
              />
              {cmnt.replies.map((reply) => (
                <CommentItem
                  key={reply.cmnt_id}
                  comment={reply}
                  currentMemberId={currentMemberId}
                  isAdmin={isAdmin}
                  members={members}
                  isReply
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {currentMemberId && (
        <div className="flex flex-col gap-2 pt-1">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>↩ @{replyTo.mem_nm}에게 답글</span>
              <button onClick={() => setReplyTo(null)} className="hover:text-foreground">
                ✕
              </button>
            </div>
          )}
          <MentionInput
            value={newText}
            onChange={setNewText}
            onMentionsChange={setNewMentions}
            members={members}
            placeholder={replyTo ? "답글을 입력하세요..." : "댓글을 입력하세요..."}
            rows={2}
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={loading || !newText.trim()}
            className="self-end"
          >
            {replyTo ? "답글 달기" : "댓글 달기"}
          </Button>
        </div>
      )}
    </div>
  )
}
