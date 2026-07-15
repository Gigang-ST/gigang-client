"use client"

import { useEffect, useMemo, useRef, useState } from "react"


import { createClient } from "@/lib/supabase/client"

import { createComment } from "@/app/actions/comment/manage-comment"

import { InactiveGateDialog } from "@/components/common/inactive-gate-dialog"
import { SectionLabel } from "@/components/common/typography"
import { detectInAppBrowser, openExternalBrowser } from "@/components/in-app-browser-gate"
import { Button } from "@/components/ui/button"

import { CommentItem, type CmntRow } from "./comment-item"
import { MentionInput, parseMentionsFromText, type MemberOption } from "./mention-input"

interface CommentSectionProps {
  entityType: "sch_post" | "comp" | "gathering"
  entityId: string
  teamId: string
  currentMemberId?: string
  /**
   * 뷰어가 비활성/탈퇴 회원인가. true면 currentMemberId 로 읽기는 열되(블러 없음),
   * 작성 입력창은 "관리자에게 문의" 게이트로 대체한다("보기는 열고 쓰기만 차단").
   */
  viewerInactive?: boolean
  /** 비활성/탈퇴 세부 구분 — InactiveGateDialog 문구 분기용 */
  viewerInactiveKind?: "inactive" | "left"
  /** 현재 멤버 이름·아바타 — optimistic 댓글에 사용(membersCache 로드 타이밍과 무관하게 본인 프로필 표시) */
  currentMemberName?: string | null
  currentMemberAvatarUrl?: string | null
  isAdmin?: boolean
  members: MemberOption[]
  initialComments?: CmntRow[]
  /** 비로그인 → 로그인 후 돌아올 경로. 예: "/?comp=abc123" */
  loginReturnPath?: string
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
  viewerInactive = false,
  viewerInactiveKind,
  currentMemberName,
  currentMemberAvatarUrl,
  isAdmin,
  members,
  initialComments,
  loginReturnPath,
}: CommentSectionProps) {
  const [inactiveGateOpen, setInactiveGateOpen] = useState(false)
  const [comments, setComments] = useState<CmntRow[]>(initialComments ?? [])
  const [loadingComments, setLoadingComments] = useState(!!currentMemberId && !initialComments)

  // entityId 변경 시 (다른 글 열기) 이전 댓글 초기화
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComments(initialComments ?? [])
     
    setLoadingComments(!!currentMemberId && !initialComments)
  }, [entityId])
  const [newText, setNewText] = useState("")
  const [replyTo, setReplyTo] = useState<CmntRow | null>(null)
  const [replyText, setReplyText] = useState("")

  const supabase = useMemo(() => createClient(), [])
  const membersRef = useRef(members)
  useEffect(() => { membersRef.current = members }, [members])

  // 댓글 클라이언트 직접 조회
  useEffect(() => {
    if (!currentMemberId || initialComments) return
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
              // 내가 보낸 optimistic 댓글이 아직 교체 안 된 상태에서 Realtime이 먼저 온 경우 → optimistic 교체
              const optimisticIdx = prev.findIndex(
                (c) => c.optimistic && c.mem_id === incoming.mem_id && c.cont_txt === incoming.cont_txt && c.prnt_id === incoming.prnt_id
              )
              if (optimisticIdx !== -1) {
                const next = [...prev]
                next[optimisticIdx] = { ...incoming, mem_nm: prev[optimisticIdx].mem_nm, avatar_url: prev[optimisticIdx].avatar_url }
                return next
              }
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
    // 본인 이름·아바타는 prop 우선 — membersCache 로드 타이밍과 무관하게 본인 프로필 표시.
    // members는 prop이 없을 때만 fallback.
    const me = members.find((m) => m.mem_id === currentMemberId)
    const myName = currentMemberName ?? me?.mem_nm ?? "나"
    const myAvatar = currentMemberAvatarUrl ?? me?.avatar_url ?? null
    const tempId = `optimistic-${Date.now()}`
    const optimisticComment: CmntRow = {
      cmnt_id: tempId,
      prnt_id: null,
      mem_id: currentMemberId,
      mem_nm: myName,
      avatar_url: myAvatar,
      cont_txt: newText.trim(),
      edit_yn: false,
      del_yn: false,
      crt_at: new Date().toISOString(),
      upd_at: new Date().toISOString(),
      optimistic: true,
    }
    setComments((prev) => [...prev, optimisticComment])
    setNewText("")

    const result = await createComment({
      entityType,
      entityId,
      contTxt: optimisticComment.cont_txt,
      mentionedMemIds: parseMentionsFromText(optimisticComment.cont_txt, members),
    })

    if (result.ok) {
      setComments((prev) => prev.map((c) =>
        c.cmnt_id === tempId
          ? { ...c, cmnt_id: result.data.cmnt_id, crt_at: result.data.crt_at, upd_at: result.data.upd_at, optimistic: false }
          : c
      ))
    } else {
      setComments((prev) => prev.map((c) =>
        c.cmnt_id === tempId ? { ...c, optimistic: false, optimisticFailed: true } : c
      ))
    }
  }

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !currentMemberId || !replyTo) return
    const me = members.find((m) => m.mem_id === currentMemberId)
    const myName = currentMemberName ?? me?.mem_nm ?? "나"
    const myAvatar = currentMemberAvatarUrl ?? me?.avatar_url ?? null
    const tempId = `optimistic-${Date.now()}`
    const prntId = replyTo.prnt_id ?? replyTo.cmnt_id
    const optimisticReply: CmntRow = {
      cmnt_id: tempId,
      prnt_id: prntId,
      mem_id: currentMemberId,
      mem_nm: myName,
      avatar_url: myAvatar,
      cont_txt: replyText.trim(),
      edit_yn: false,
      del_yn: false,
      crt_at: new Date().toISOString(),
      upd_at: new Date().toISOString(),
      optimistic: true,
    }
    setComments((prev) => [...prev, optimisticReply])
    setReplyText("")
    setReplyTo(null)

    const result = await createComment({
      entityType,
      entityId,
      contTxt: optimisticReply.cont_txt,
      prntId,
      mentionedMemIds: parseMentionsFromText(optimisticReply.cont_txt, members),
    })

    if (result.ok) {
      setComments((prev) => prev.map((c) =>
        c.cmnt_id === tempId
          ? { ...c, cmnt_id: result.data.cmnt_id, crt_at: result.data.crt_at, upd_at: result.data.upd_at, optimistic: false }
          : c
      ))
    } else {
      setComments((prev) => prev.map((c) =>
        c.cmnt_id === tempId ? { ...c, optimistic: false, optimisticFailed: true } : c
      ))
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
            <Button
              size="sm"
              onClick={() => {
                const next = loginReturnPath
                  ? `/auth/login?next=${encodeURIComponent(loginReturnPath)}`
                  : "/auth/login";
                const inApp = detectInAppBrowser();
                if (inApp) openExternalBrowser(window.location.origin + next);
                else window.location.href = next;
              }}
            >
              로그인
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
                onReply={!currentMemberId ? undefined : viewerInactive ? () => setInactiveGateOpen(true) : (c) => { setReplyTo(c); setReplyText(`@${c.mem_nm} `) }}
              />
              {cmnt.replies.map((reply) => (
                <CommentItem
                  key={reply.cmnt_id}
                  comment={reply}
                  currentMemberId={currentMemberId}
                  isAdmin={isAdmin}
                  members={members}
                  isReply
                  onReply={!currentMemberId ? undefined : viewerInactive ? () => setInactiveGateOpen(true) : (c) => { setReplyTo(c); setReplyText(`@${c.mem_nm} `) }}
                />
              ))}

              {!viewerInactive && replyTo && (replyTo.cmnt_id === cmnt.cmnt_id || replyTo.prnt_id === cmnt.cmnt_id) && currentMemberId && (
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
                      disabled={!replyText.trim()}
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

      {viewerInactive ? (
        // 보기는 열되(위 목록은 그대로 노출), 작성 입력창 대신 비활성 안내 게이트를 연다.
        <button
          onClick={() => setInactiveGateOpen(true)}
          className="mt-1 rounded-xl border border-dashed border-border py-3 text-[13px] text-muted-foreground transition-colors hover:bg-secondary"
        >
          비활성 상태예요 · 댓글을 쓰려면 관리자 승인이 필요해요
        </button>
      ) : (
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
            disabled={!newText.trim()}
            className="self-end"
          >
            댓글 달기
          </Button>
        </div>
      )}

      <InactiveGateDialog open={inactiveGateOpen} onOpenChange={setInactiveGateOpen} kind={viewerInactiveKind} />
    </div>
  )
}
