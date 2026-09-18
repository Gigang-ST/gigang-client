"use client"

import { useEffect, useMemo, useState } from "react"


import { createClient } from "@/lib/supabase/client"

import { createComment } from "@/app/actions/comment/manage-comment"

import { InactiveGateDialog } from "@/components/common/inactive-gate-dialog"
import { SectionLabel } from "@/components/common/typography"
import { detectInAppBrowser, openExternalBrowser } from "@/components/in-app-browser-gate"
import { Button } from "@/components/ui/button"

import { CommentItem, type CmntRow } from "./comment-item"
import { MentionInput, parseMentionsFromText, type MemberOption } from "./mention-input"

interface CommentSectionProps {
  /** "post" = 기강이야기 운동기록. DB CHECK 제약·zod enum과 함께 움직인다 */
  entityType: "sch_post" | "comp" | "gathering" | "post"
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
  /** 비로그인 → 로그인 후 돌아올 경로. 예: "/schedule?comp=abc123" */
  loginReturnPath?: string
  /**
   * 목록이 바뀔 때마다(작성·수정·삭제·첫 조회) 그 결과를 위로 올려보낸다.
   *
   * ⚠️ **참조가 안정적이어야 한다**(`useCallback`) — effect 의존성에 들어간다.
   *
   * 시트가 곧 전부인 지면(모임·대회·일정 상세)은 안 넘겨도 된다. 릴스처럼 **같은 댓글이
   * 시트 밖에도 그려지는 곳**만 넘긴다 — 예전엔 `cmnt_mst` Realtime이 두 표면을 각각
   * 갱신해 줘서 배선이 필요 없었다(§성능 점검 C).
   */
  onCommentsChange?: (comments: CmntRow[]) => void
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
  onCommentsChange,
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

  /**
   * 목록이 바뀔 때마다 위로 올려보낸다 — **시트 밖 표면**(릴스 말풍선·하단 개수·격자 배지)이
   * 이 결과를 나눠 쓴다(§RecordReelViewer). 시트가 곧 전부인 지면(모임·대회·일정)은 안 넘긴다.
   *
   * 마운트 직후 한 번은 `initialComments`와 같은 내용으로 도는데, 받는 쪽이 내용 서명으로
   * 걸러 낸다(§usePostComments의 `syncComments`).
   */
  useEffect(() => {
    onCommentsChange?.(comments)
  }, [comments, onCommentsChange])

  /** 수정 성공 — 이 행만 갈아끼운다(§CommentItem의 onEdited) */
  const handleEdited = (cmntId: string, contTxt: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.cmnt_id === cmntId
          ? { ...c, cont_txt: contTxt, edit_yn: true, upd_at: new Date().toISOString() }
          : c
      )
    )
  }

  /** 삭제 성공 — 행은 남기고 `del_yn`만 세운다(자리표시자로 스레드 맥락 유지) */
  const handleDeleted = (cmntId: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.cmnt_id === cmntId
          ? { ...c, del_yn: true, upd_at: new Date().toISOString() }
          : c
      )
    )
  }

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
                onEdited={handleEdited}
                onDeleted={handleDeleted}
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
                  onEdited={handleEdited}
                  onDeleted={handleDeleted}
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
