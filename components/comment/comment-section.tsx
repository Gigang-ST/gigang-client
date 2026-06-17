"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import Link from "next/link"

import { createClient } from "@/lib/supabase/client"

import { createComment } from "@/app/actions/comment/manage-comment"

import { SectionLabel } from "@/components/common/typography"
import { Button } from "@/components/ui/button"

import { CommentItem, type CmntRow } from "./comment-item"
import { MentionInput, parseMentionsFromText, type MemberOption } from "./mention-input"

interface CommentSectionProps {
  entityType: "sch_post" | "comp" | "gathering"
  entityId: string
  teamId: string
  currentMemberId?: string
  isAdmin?: boolean
  members: MemberOption[]
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
  teamId,
  currentMemberId,
  isAdmin,
  members,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CmntRow[]>([])
  const [loadingComments, setLoadingComments] = useState(!!currentMemberId)
  const [newText, setNewText] = useState("")
  const [replyTo, setReplyTo] = useState<CmntRow | null>(null)
  const [replyText, setReplyText] = useState("")
  const [loading, setLoading] = useState(false)

  const supabase = useMemo(() => createClient(), [])
  const membersRef = useRef(members)
  useEffect(() => { membersRef.current = members }, [members])

  // 댓글 클라이언트 직접 조회
  useEffect(() => {
    if (!currentMemberId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingComments(true)
    supabase
      .from("cmnt_mst")
      .select("cmnt_id, prnt_id, mem_id, cont_txt, edit_yn, del_yn, crt_at, upd_at, mem_mst!cmnt_mst_mem_id_fkey(mem_nm, avatar_url)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("team_id", teamId)
      .order("crt_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        const rows: CmntRow[] = (data ?? []).map((row) => {
          const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst
          return {
            cmnt_id: row.cmnt_id,
            prnt_id: row.prnt_id,
            mem_id: row.mem_id,
            mem_nm: (mem as { mem_nm: string })?.mem_nm ?? "멤버",
            avatar_url: (mem as { avatar_url?: string | null })?.avatar_url ?? null,
            cont_txt: row.cont_txt,
            edit_yn: row.edit_yn,
            del_yn: row.del_yn,
            crt_at: row.crt_at,
            upd_at: row.upd_at,
          }
        })
        setComments(rows)
        setLoadingComments(false)
      })
    return () => { cancelled = true }
  }, [entityType, entityId, teamId, currentMemberId, supabase])

  // 실시간 구독
  useEffect(() => {
    if (!currentMemberId) return
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
          const row = payload.new as Record<string, unknown>
          // entity_type, team_id 추가 검증 — 동일 entity_id를 공유하는 다른 팀/타입 댓글 혼입 방지
          if (row.entity_type !== entityType || row.team_id !== teamId) return
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as CmntRow
            setComments((prev) => {
              if (prev.some((c) => c.cmnt_id === incoming.cmnt_id)) return prev
              const mem = membersRef.current.find((m) => m.mem_id === incoming.mem_id)
              return [...prev, { ...incoming, mem_nm: mem?.mem_nm ?? "멤버", avatar_url: incoming.avatar_url ?? mem?.avatar_url ?? null }]
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
  }, [entityType, entityId, currentMemberId, supabase])

  const handleSubmitComment = async () => {
    if (!newText.trim() || !currentMemberId) return
    setLoading(true)
    try {
      const result = await createComment({
        entityType,
        entityId,
        contTxt: newText.trim(),
        mentionedMemIds: parseMentionsFromText(newText, members),
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
            avatar_url: me?.avatar_url ?? null,
            cont_txt: result.data.cont_txt,
            edit_yn: result.data.edit_yn,
            del_yn: result.data.del_yn,
            crt_at: result.data.crt_at,
            upd_at: result.data.upd_at,
          },
        ])
        setNewText("")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !currentMemberId || !replyTo) return
    setLoading(true)
    try {
      const result = await createComment({
        entityType,
        entityId,
        contTxt: replyText.trim(),
        prntId: replyTo.prnt_id ?? replyTo.cmnt_id,
        mentionedMemIds: parseMentionsFromText(replyText, members),
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
            avatar_url: me?.avatar_url ?? null,
            cont_txt: result.data.cont_txt,
            edit_yn: result.data.edit_yn,
            del_yn: result.data.del_yn,
            crt_at: result.data.crt_at,
            upd_at: result.data.upd_at,
          },
        ])
        setReplyText("")
        setReplyTo(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const visibleCount = useMemo(() => comments.filter((c) => !c.del_yn).length, [comments])
  const tree = useMemo(() => buildTree(comments), [comments])

  // 비회원 블러 처리
  if (!currentMemberId) {
    return (
      <div className="flex flex-col gap-3">
        <SectionLabel>COMMENTS</SectionLabel>
        <div className="relative">
          <div className="pointer-events-none select-none blur-sm">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-2 py-2">
                <div className="size-7 shrink-0 rounded-full bg-muted" />
                <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
                  <div className="h-2.5 w-16 rounded bg-muted" />
                  <div className="h-2.5 w-full rounded bg-muted" />
                  <div className="h-2.5 w-2/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="text-xs text-muted-foreground">로그인하면 댓글을 볼 수 있어요</p>
            <Button asChild size="sm">
              <Link href="/auth/login">로그인</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>
        {`COMMENTS${visibleCount > 0 ? ` · ${visibleCount}` : ""}`}
      </SectionLabel>

      {loadingComments ? (
        <p className="py-2 text-sm text-muted-foreground">댓글 불러오는 중...</p>
      ) : tree.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">아직 댓글이 없습니다.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {tree.map((cmnt) => (
            <div key={cmnt.cmnt_id}>
              <CommentItem
                comment={cmnt}
                currentMemberId={currentMemberId}
                isAdmin={isAdmin}
                members={members}
                onReply={currentMemberId ? (c) => { setReplyTo(c); setReplyText(`@${c.mem_nm} `) } : undefined}
              />
              {cmnt.replies.map((reply) => (
                <CommentItem
                  key={reply.cmnt_id}
                  comment={reply}
                  currentMemberId={currentMemberId}
                  isAdmin={isAdmin}
                  members={members}
                  isReply
                  onReply={currentMemberId ? (c) => { setReplyTo(c); setReplyText(`@${c.mem_nm} `) } : undefined}
                />
              ))}

              {replyTo && (replyTo.cmnt_id === cmnt.cmnt_id || replyTo.prnt_id === cmnt.cmnt_id) && currentMemberId && (
                <div className="pl-10 pb-3 pt-1 flex flex-col gap-2">
                  <MentionInput
                    value={replyText}
                    onChange={setReplyText}
                    members={members}
                    placeholder="답글을 입력하세요..."
                    rows={2}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSubmitReply}
                      disabled={loading || !replyText.trim()}
                    >
                      답글 달기
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setReplyTo(null); setReplyText("") }}
                      className="text-muted-foreground"
                    >
                      취소
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <MentionInput
          value={newText}
          onChange={setNewText}
          members={members}
          placeholder="댓글을 입력하세요..."
          rows={2}
        />
        <Button
          size="sm"
          onClick={handleSubmitComment}
          disabled={loading || !newText.trim()}
          className="self-end"
        >
          댓글 달기
        </Button>
      </div>
    </div>
  )
}
