# Comment System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소식·대회에 댓글/답글/멘션 기능 추가. 범용 구조로 나중에 모임에도 재사용.

**Architecture:** `cmnt_mst` 폴리모픽 테이블(entity_type + entity_id)이 소식·대회·모임 댓글을 공용 관리. `CommentSection` 클라이언트 컴포넌트가 Supabase Realtime 구독으로 실시간 반영. `MentionInput`은 독립 컴포넌트로 어디서든 재사용. 서버 액션이 CRUD + 멘션(`cmnt_mention_rel`) 저장 + `noti_mst` 알림 트리거 담당.

**Tech Stack:** Next.js App Router, Supabase JS (Realtime + RLS), Zod, Tailwind CSS, shadcn/ui

---

## 파일 맵

| 상태 | 파일 | 역할 |
|------|------|------|
| 신규 | `supabase/migrations/20260615120000_cmnt_noti_types.sql` | noti_type_enm CHECK 업데이트 |
| 신규 | `lib/validations/comment.ts` | Zod 스키마 |
| 신규 | `app/actions/comment/manage-comment.ts` | CRUD 서버 액션 + 알림 |
| 신규 | `app/actions/comment/get-comment-data.ts` | 초기 데이터 조회 서버 액션 |
| 신규 | `components/comment/mention-input.tsx` | @멘션 입력창 (재사용 가능) |
| 신규 | `components/comment/comment-item.tsx` | 댓글 단일 아이템 |
| 신규 | `components/comment/comment-section.tsx` | 댓글 목록 + 입력 + Realtime |
| 신규 | `components/schedule/sch-post-detail-dialog.tsx` | 소식 상세 팝업 + 댓글 |
| 수정 | `lib/supabase/database.types.ts` | 타입 재생성 (MCP) |
| 수정 | `app/actions/admin/send-notification.ts` | NotiTypeEnm 타입 확장 |
| 수정 | `app/(main)/page.tsx` | `sch_post` → `sch_post_mst` |
| 수정 | `app/actions/schedule/manage-sch-post.ts` | `sch_post` → `sch_post_mst` |
| 수정 | `components/home/mini-calendar.tsx` | `sch_post` → `sch_post_mst`, 클릭 → 상세 팝업 |
| 수정 | `components/home/schedule-list-view.tsx` | `sch_post` → `sch_post_mst`, 클릭 → 상세 팝업 |
| 수정 | `components/races/competition-detail-dialog.tsx` | 하단에 CommentSection 추가 |

---

## Task 1: noti_type 마이그레이션 + DB 타입 재생성 + sch_post_mst 코드 업데이트

**Files:**
- Create: `supabase/migrations/20260615120000_cmnt_noti_types.sql`
- Modify: `lib/supabase/database.types.ts` (MCP 재생성)
- Modify: `app/actions/admin/send-notification.ts`
- Modify: `app/(main)/page.tsx`
- Modify: `app/actions/schedule/manage-sch-post.ts`
- Modify: `components/home/mini-calendar.tsx`
- Modify: `components/home/schedule-list-view.tsx`

- [ ] **Step 1: noti_type 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260615120000_cmnt_noti_types.sql
ALTER TABLE noti_mst
  DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

ALTER TABLE noti_mst
  ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm IN (
    'ttl_grnt', 'adm_cust', 'dues_check_req', 'dues_notice',
    'cmnt_reply', 'cmnt_mention'
  ));
```

- [ ] **Step 2: dev DB에 마이그레이션 적용** (MCP `apply_migration` 사용)

- [ ] **Step 3: database.types.ts 재생성** (MCP `generate_typescript_types` 사용 → 파일 덮어쓰기)

- [ ] **Step 4: NotiTypeEnm 타입 확장**

`app/actions/admin/send-notification.ts` 1번 줄:
```typescript
export type NotiTypeEnm = "adm_cust" | "dues_notice" | "cmnt_reply" | "cmnt_mention";
```

- [ ] **Step 5: sch_post → sch_post_mst 참조 5곳 일괄 수정**

다음 파일들에서 `.from("sch_post")` → `.from("sch_post_mst")` 교체:
- `app/(main)/page.tsx:188`
- `app/actions/schedule/manage-sch-post.ts:24,62,76`
- `components/home/mini-calendar.tsx:309`
- `components/home/schedule-list-view.tsx:57`

- [ ] **Step 6: 빌드 확인**

```bash
pnpm run build
```
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/20260615120000_cmnt_noti_types.sql lib/supabase/database.types.ts app/actions/admin/send-notification.ts app/(main)/page.tsx app/actions/schedule/manage-sch-post.ts components/home/mini-calendar.tsx components/home/schedule-list-view.tsx
git commit -m "chore: sch_post→sch_post_mst 리네임 코드 반영 + cmnt noti_type 추가"
```

---

## Task 2: Zod 스키마

**Files:**
- Create: `lib/validations/comment.ts`

- [ ] **Step 1: 스키마 파일 작성**

```typescript
// lib/validations/comment.ts
import { z } from "zod"

export const createCommentSchema = z.object({
  entityType: z.enum(["sch_post", "comp", "gathering"]),
  entityId: z.string().uuid(),
  contTxt: z.string().min(1, "내용을 입력해주세요").max(1000, "1000자 이내로 입력해주세요"),
  prntId: z.string().uuid().optional(),
  mentionedMemIds: z.array(z.string().uuid()).default([]),
})

export const updateCommentSchema = z.object({
  cmntId: z.string().uuid(),
  contTxt: z.string().min(1).max(1000),
  mentionedMemIds: z.array(z.string().uuid()).default([]),
})

export const deleteCommentSchema = z.object({
  cmntId: z.string().uuid(),
})

export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>
export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>
```

- [ ] **Step 2: 커밋**

```bash
git add lib/validations/comment.ts
git commit -m "feat(comment): Zod 스키마 추가"
```

---

## Task 3: 서버 액션 (CRUD + 알림 + 초기 데이터)

**Files:**
- Create: `app/actions/comment/manage-comment.ts`
- Create: `app/actions/comment/get-comment-data.ts`

- [ ] **Step 1: CRUD 서버 액션 작성**

```typescript
// app/actions/comment/manage-comment.ts
"use server"

import { revalidatePath } from "next/cache"
import { getCurrentMember } from "@/lib/queries/member"
import { getRequestTeamContext } from "@/lib/queries/request-team"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  createCommentSchema,
  updateCommentSchema,
  deleteCommentSchema,
  type CreateCommentInput,
  type UpdateCommentInput,
  type DeleteCommentInput,
} from "@/lib/validations/comment"

export async function createComment(input: CreateCommentInput) {
  const parsed = createCommentSchema.parse(input)
  const { member, supabase } = await getCurrentMember()
  if (!member) return { ok: false as const, message: "로그인 필요" }

  const { teamId } = await getRequestTeamContext()
  const admin = createAdminClient()

  // 1단계 답글만 허용
  if (parsed.prntId) {
    const { data: parent } = await supabase
      .from("cmnt_mst")
      .select("prnt_id")
      .eq("cmnt_id", parsed.prntId)
      .single()
    if (parent?.prnt_id) return { ok: false as const, message: "답글의 답글은 허용되지 않습니다." }
  }

  const { data: cmnt, error } = await supabase
    .from("cmnt_mst")
    .insert({
      team_id: teamId,
      entity_type: parsed.entityType,
      entity_id: parsed.entityId,
      prnt_id: parsed.prntId ?? null,
      mem_id: member.id,
      cont_txt: parsed.contTxt,
    })
    .select()
    .single()

  if (error || !cmnt) return { ok: false as const, message: "댓글 저장 실패" }

  // 멘션 저장 + 알림
  const uniqueMentions = [...new Set(parsed.mentionedMemIds)].filter((id) => id !== member.id)
  if (uniqueMentions.length > 0) {
    await admin
      .from("cmnt_mention_rel")
      .insert(uniqueMentions.map((memId) => ({ cmnt_id: cmnt.cmnt_id, mem_id: memId })))
    await admin.from("noti_mst").insert(
      uniqueMentions.map((memId) => ({
        team_id: teamId,
        mem_id: memId,
        noti_type_enm: "cmnt_mention",
        noti_nm: `${member.full_name}님이 댓글에서 멘션했습니다.`,
        noti_cont: parsed.contTxt.slice(0, 100),
        ref_id: cmnt.cmnt_id,
        ref_type_enm: "cmnt",
      }))
    )
  }

  // 답글 알림 — 원댓글 작성자 (본인 제외, 멘션 중복 제외)
  if (parsed.prntId) {
    const { data: parent } = await admin
      .from("cmnt_mst")
      .select("mem_id")
      .eq("cmnt_id", parsed.prntId)
      .single()
    if (parent && parent.mem_id !== member.id && !uniqueMentions.includes(parent.mem_id)) {
      await admin.from("noti_mst").insert({
        team_id: teamId,
        mem_id: parent.mem_id,
        noti_type_enm: "cmnt_reply",
        noti_nm: `${member.full_name}님이 댓글에 답글을 달았습니다`,
        noti_cont: parsed.contTxt.slice(0, 100),
        ref_id: cmnt.cmnt_id,
        ref_type_enm: "cmnt",
      })
    }
  }

  revalidatePath("/")
  return { ok: true as const, data: cmnt }
}

export async function updateComment(input: UpdateCommentInput) {
  const parsed = updateCommentSchema.parse(input)
  const { member, supabase } = await getCurrentMember()
  if (!member) return { ok: false as const, message: "로그인 필요" }

  const admin = createAdminClient()

  // 답글 달린 댓글 수정 불가
  const { count } = await supabase
    .from("cmnt_mst")
    .select("cmnt_id", { count: "exact", head: true })
    .eq("prnt_id", parsed.cmntId)
    .eq("del_yn", false)
  if ((count ?? 0) > 0) return { ok: false as const, message: "답글이 달린 댓글은 수정할 수 없습니다." }

  const { error } = await supabase
    .from("cmnt_mst")
    .update({ cont_txt: parsed.contTxt, edit_yn: true, upd_at: new Date().toISOString() })
    .eq("cmnt_id", parsed.cmntId)
    .eq("mem_id", member.id)
    .eq("del_yn", false)

  if (error) return { ok: false as const, message: "댓글 수정 실패" }

  // 멘션 갱신
  await admin.from("cmnt_mention_rel").delete().eq("cmnt_id", parsed.cmntId)
  const uniqueMentions = [...new Set(parsed.mentionedMemIds)].filter((id) => id !== member.id)
  if (uniqueMentions.length > 0) {
    await admin
      .from("cmnt_mention_rel")
      .insert(uniqueMentions.map((memId) => ({ cmnt_id: parsed.cmntId, mem_id: memId })))
  }

  revalidatePath("/")
  return { ok: true as const }
}

export async function deleteComment(input: DeleteCommentInput) {
  const parsed = deleteCommentSchema.parse(input)
  const { member, supabase } = await getCurrentMember()
  if (!member) return { ok: false as const, message: "로그인 필요" }

  const admin = createAdminClient()

  if (!member.admin) {
    // 일반 멤버: 답글 달린 댓글 삭제 불가
    const { count } = await supabase
      .from("cmnt_mst")
      .select("cmnt_id", { count: "exact", head: true })
      .eq("prnt_id", parsed.cmntId)
      .eq("del_yn", false)
    if ((count ?? 0) > 0) return { ok: false as const, message: "답글이 달린 댓글은 삭제할 수 없습니다." }
  }

  // 관리자는 admin client(RLS bypass), 일반 멤버는 supabase(RLS — 본인 댓글만 허용)
  const db = member.admin ? admin : supabase
  const { error } = await db
    .from("cmnt_mst")
    .update({ del_yn: true, upd_at: new Date().toISOString() })
    .eq("cmnt_id", parsed.cmntId)

  if (error) return { ok: false as const, message: "댓글 삭제 실패" }

  revalidatePath("/")
  return { ok: true as const }
}
```

- [ ] **Step 2: 초기 데이터 조회 서버 액션 작성**

```typescript
// app/actions/comment/get-comment-data.ts
"use server"

import { getCurrentMember } from "@/lib/queries/member"
import { getRequestTeamContext } from "@/lib/queries/request-team"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CmntRow } from "@/components/comment/comment-item"

export async function getCommentData(entityType: string, entityId: string) {
  const { member } = await getCurrentMember()
  if (!member) return { comments: [], members: [] }

  const { teamId } = await getRequestTeamContext()
  const admin = createAdminClient()

  const [{ data: cmntRows }, { data: memRows }] = await Promise.all([
    admin
      .from("cmnt_mst")
      .select("cmnt_id, prnt_id, mem_id, cont_txt, edit_yn, del_yn, crt_at, upd_at, mem_mst!inner(mem_nm, avatar_url)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("team_id", teamId)
      .order("crt_at", { ascending: true }),
    admin
      .from("team_mem_rel")
      .select("mem_id, mem_mst!inner(mem_nm)")
      .eq("team_id", teamId)
      .eq("mem_st_cd", "active")
      .eq("del_yn", false),
  ])

  const comments: CmntRow[] = (cmntRows ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst
    return {
      cmnt_id: row.cmnt_id,
      prnt_id: row.prnt_id,
      mem_id: row.mem_id,
      mem_nm: (mem as { mem_nm: string }).mem_nm,
      avatar_url: (mem as { avatar_url?: string | null }).avatar_url ?? null,
      cont_txt: row.cont_txt,
      edit_yn: row.edit_yn,
      del_yn: row.del_yn,
      crt_at: row.crt_at,
      upd_at: row.upd_at,
    }
  })

  const members = (memRows ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst
    return { mem_id: row.mem_id, mem_nm: (mem as { mem_nm: string }).mem_nm }
  })

  return { comments, members }
}
```

- [ ] **Step 3: 커밋**

```bash
git add app/actions/comment/
git commit -m "feat(comment): CRUD 서버 액션 + 초기 데이터 조회 추가"
```

---

## Task 4: MentionInput 컴포넌트

**Files:**
- Create: `components/comment/mention-input.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```typescript
// components/comment/mention-input.tsx
"use client"

import { useCallback, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"

export type MemberOption = { mem_id: string; mem_nm: string }

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onMentionsChange: (memIds: string[]) => void
  members: MemberOption[]
  placeholder?: string
  rows?: number
  className?: string
}

function parseMentionQuery(text: string, cursorPos: number): { query: string; start: number } | null {
  const before = text.slice(0, cursorPos)
  const match = before.match(/@([가-힣a-zA-Z0-9_]*)$/)
  if (!match) return null
  return { query: match[1], start: cursorPos - match[0].length }
}

// @이름 텍스트를 파란색으로 강조 — 공용 유틸
export function renderMentions(text: string) {
  const parts = text.split(/(@[가-힣a-zA-Z0-9_]+)/)
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-primary font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function MentionInput({
  value,
  onChange,
  onMentionsChange,
  members,
  placeholder,
  rows = 3,
  className,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionedIds = useRef<Set<string>>(new Set())
  const [mentionState, setMentionState] = useState<{
    query: string
    start: number
    filtered: MemberOption[]
  } | null>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value
      const cursor = e.target.selectionStart ?? text.length
      onChange(text)

      const parsed = parseMentionQuery(text, cursor)
      if (parsed) {
        const filtered = members.filter((m) =>
          m.mem_nm.toLowerCase().includes(parsed.query.toLowerCase())
        )
        setMentionState(filtered.length > 0 ? { ...parsed, filtered } : null)
      } else {
        setMentionState(null)
      }
    },
    [members, onChange]
  )

  const selectMember = useCallback(
    (member: MemberOption) => {
      if (!mentionState) return
      const cursor = textareaRef.current?.selectionStart ?? value.length
      const before = value.slice(0, mentionState.start)
      const after = value.slice(cursor)
      const newText = `${before}@${member.mem_nm} ${after}`
      onChange(newText)
      mentionedIds.current.add(member.mem_id)
      onMentionsChange([...mentionedIds.current])
      setMentionState(null)
      // 커서 위치 복귀
      setTimeout(() => {
        const pos = before.length + member.mem_nm.length + 2
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(pos, pos)
      }, 0)
    },
    [mentionState, value, onChange, onMentionsChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && mentionState) {
        setMentionState(null)
        e.preventDefault()
      }
    },
    [mentionState]
  )

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`resize-none ${className ?? ""}`}
      />
      {mentionState && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-48 overflow-hidden rounded-lg border border-border bg-background shadow-md">
          {mentionState.filtered.slice(0, 5).map((m) => (
            <button
              key={m.mem_id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault()
                selectMember(m)
              }}
            >
              @{m.mem_nm}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/comment/mention-input.tsx
git commit -m "feat(comment): MentionInput 컴포넌트 추가 (@멘션 자동완성)"
```

---

## Task 5: CommentItem 컴포넌트

**Files:**
- Create: `components/comment/comment-item.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```typescript
// components/comment/comment-item.tsx
"use client"

import { useState } from "react"
import { dayjs } from "@/lib/dayjs"
import { Avatar } from "@/components/common/avatar"
import { Body, Caption } from "@/components/common/typography"
import { Button } from "@/components/ui/button"
import { MentionInput, renderMentions, type MemberOption } from "./mention-input"
import { updateComment, deleteComment } from "@/app/actions/comment/manage-comment"

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
  const [editMentions, setEditMentions] = useState<string[]>([])
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
    await updateComment({ cmntId: comment.cmnt_id, contTxt: editText.trim(), mentionedMemIds: editMentions })
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
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Body className="text-sm font-semibold">{comment.mem_nm}</Body>
          <Caption className="text-xs">{dayjs(comment.crt_at).fromNow()}</Caption>
          {comment.edit_yn && <Caption className="text-xs opacity-60">(수정됨)</Caption>}
        </div>

        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2">
            <MentionInput
              value={editText}
              onChange={setEditText}
              onMentionsChange={setEditMentions}
              members={members}
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate} disabled={loading || !editText.trim()}>
                저장
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditText(comment.cont_txt) }}>
                취소
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-sm leading-relaxed break-words">
            {renderMentions(comment.cont_txt)}
          </p>
        )}

        <div className="mt-1 flex gap-3">
          {!isReply && onReply && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => onReply(comment)}
            >
              답글
            </button>
          )}
          {canEdit && !editing && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setEditing(true)}
            >
              수정
            </button>
          )}
          {canDelete && !editing && (
            <button
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              onClick={handleDelete}
              disabled={loading}
            >
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/comment/comment-item.tsx
git commit -m "feat(comment): CommentItem 컴포넌트 추가 (수정/삭제/수정됨)"
```

---

## Task 6: CommentSection 컴포넌트 (Realtime)

**Files:**
- Create: `components/comment/comment-section.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```typescript
// components/comment/comment-section.tsx
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
            // mem_nm은 Realtime payload에 없으므로 members 목록에서 조회
            const mem = members.find((m) => m.mem_id === (payload.new as CmntRow).mem_id)
            setComments((prev) => [
              ...prev,
              { ...(payload.new as CmntRow), mem_nm: mem?.mem_nm ?? "멤버" },
            ])
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

    return () => { supabase.removeChannel(channel) }
  }, [entityType, entityId, supabase, members])

  const handleSubmit = async () => {
    if (!newText.trim()) return
    setLoading(true)
    await createComment({
      entityType,
      entityId,
      contTxt: newText.trim(),
      prntId: replyTo?.cmnt_id,
      mentionedMemIds: newMentions,
    })
    setNewText("")
    setNewMentions([])
    setReplyTo(null)
    setLoading(false)
  }

  const tree = buildTree(comments)

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>COMMENTS {comments.filter((c) => !c.del_yn).length > 0 && `· ${comments.filter((c) => !c.del_yn).length}`}</SectionLabel>

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
              <button onClick={() => setReplyTo(null)} className="hover:text-foreground">✕</button>
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
```

- [ ] **Step 2: 커밋**

```bash
git add components/comment/comment-section.tsx
git commit -m "feat(comment): CommentSection 컴포넌트 추가 (Realtime 구독)"
```

---

## Task 7: 소식 상세 팝업 + CommentSection 연결

**Files:**
- Create: `components/schedule/sch-post-detail-dialog.tsx`
- Modify: `components/home/schedule-list-view.tsx` (클릭 핸들러 연결)
- Modify: `components/home/mini-calendar.tsx` (클릭 핸들러 연결)

- [ ] **Step 1: 소식 상세 팝업 작성**

```typescript
// components/schedule/sch-post-detail-dialog.tsx
"use client"

import { useEffect, useState } from "react"
import { dayjs } from "@/lib/dayjs"
import { ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CommentSection } from "@/components/comment/comment-section"
import { getCommentData } from "@/app/actions/comment/get-comment-data"
import type { CmntRow } from "@/components/comment/comment-item"
import type { MemberOption } from "@/components/comment/mention-input"
import type { CalendarRace } from "@/components/home/mini-calendar"

interface SchPostDetailDialogProps {
  post: CalendarRace | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentMemberId?: string
  isAdmin?: boolean
}

export function SchPostDetailDialog({
  post,
  open,
  onOpenChange,
  currentMemberId,
  isAdmin,
}: SchPostDetailDialogProps) {
  const [comments, setComments] = useState<CmntRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !post) return
    setLoading(true)
    getCommentData("sch_post", post.id).then(({ comments, members }) => {
      setComments(comments)
      setMembers(members)
      setLoading(false)
    })
  }, [open, post])

  if (!post) return null

  const startAt = post.evt_stt_at ? dayjs(post.evt_stt_at) : dayjs(post.start_date)
  const endAt = post.evt_end_at ? dayjs(post.evt_end_at) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">{post.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* 일시 */}
          <p className="text-sm text-muted-foreground">
            {startAt.format("YYYY년 M월 D일 (ddd) HH:mm")}
            {endAt && ` ~ ${endAt.format("HH:mm")}`}
          </p>

          {/* URL */}
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-3.5" />
              {post.url}
            </a>
          )}

          {/* 본문 */}
          {post.cont_txt && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.cont_txt}</p>
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: `MiniCalendar`에 `SchPostDetailDialog` 연결**

`components/home/mini-calendar.tsx`에서 소식 클릭 시 `openEditForm` (작성자/관리자) 또는 `SchPostDetailDialog` (일반 멤버) 열도록 수정. 현재 클릭 핸들러 로직 확인 후 분기 추가:

```typescript
// mini-calendar.tsx 내부 — 소식(schedule) 클릭 핸들러
const [detailPost, setDetailPost] = useState<CalendarRace | null>(null)
const [detailOpen, setDetailOpen] = useState(false)

function handleScheduleClick(race: CalendarRace) {
  const isAuthorOrAdmin = race.crt_by === memberId || isAdmin
  if (isAuthorOrAdmin) {
    openEditForm(race)  // 기존 수정 폼
  } else {
    setDetailPost(race)
    setDetailOpen(true)
  }
}
// JSX에 추가:
// <SchPostDetailDialog post={detailPost} open={detailOpen} onOpenChange={setDetailOpen} currentMemberId={memberId} isAdmin={isAdmin} />
```

> `MiniCalendar`의 실제 클릭 핸들러명과 prop명은 파일 읽어서 확인 후 적용.

- [ ] **Step 3: `ScheduleListView`에 동일 분기 적용**

`components/home/schedule-list-view.tsx`의 소식 아이템 클릭 핸들러에 동일 로직 추가.

- [ ] **Step 4: 커밋**

```bash
git add components/schedule/sch-post-detail-dialog.tsx components/home/mini-calendar.tsx components/home/schedule-list-view.tsx
git commit -m "feat(comment): 소식 상세 팝업 + CommentSection 연결"
```

---

## Task 8: 대회 상세 다이얼로그에 CommentSection 추가

**Files:**
- Modify: `components/races/competition-detail-dialog.tsx`

- [ ] **Step 1: 파일 읽어서 구조 파악**

`components/races/competition-detail-dialog.tsx` 전체 확인 — props, 상태, JSX 구조 파악.

- [ ] **Step 2: CommentSection 추가**

다이얼로그 내부에서 `open` 상태 변경 시 댓글 데이터 로드:

```typescript
// competition-detail-dialog.tsx 상단에 추가
import { useEffect, useState } from "react"
import { CommentSection } from "@/components/comment/comment-section"
import { getCommentData } from "@/app/actions/comment/get-comment-data"
import type { CmntRow } from "@/components/comment/comment-item"
import type { MemberOption } from "@/components/comment/mention-input"

// 컴포넌트 내부 상태 추가
const [cmntData, setCmntData] = useState<{ comments: CmntRow[]; members: MemberOption[] }>({ comments: [], members: [] })

useEffect(() => {
  if (!open || !competition) return
  getCommentData("comp", competition.id).then(setCmntData)
}, [open, competition])

// JSX 내부 다이얼로그 콘텐츠 하단에 추가 (기존 내용 아래)
<div className="border-t border-border pt-4 mt-4">
  <CommentSection
    entityType="comp"
    entityId={competition.id}
    currentMemberId={currentMemberId}
    isAdmin={isAdmin}
    members={cmntData.members}
    initialComments={cmntData.comments}
  />
</div>
```

> 실제 파일의 prop명(`competition.id`, `currentMemberId`, `isAdmin`)은 Step 1에서 확인한 실제 이름으로 교체.

- [ ] **Step 3: 빌드 + 린트 확인**

```bash
pnpm run build
```
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/races/competition-detail-dialog.tsx
git commit -m "feat(comment): 대회 상세 다이얼로그에 CommentSection 추가"
```

---

## 완료 후 체크리스트

- [ ] 소식 클릭 → 댓글 보임, 달 수 있음
- [ ] 대회 상세 → 댓글 보임, 달 수 있음
- [ ] `@이름` 타이핑 시 멤버 드롭다운 표시
- [ ] 멘션 선택 후 알림 발송 확인
- [ ] 답글 달기 → 원댓글 작성자에게 알림
- [ ] 답글 달린 댓글 수정/삭제 버튼 비활성
- [ ] 삭제된 댓글 → "삭제된 댓글입니다" 표시
- [ ] 다른 탭에서 댓글 작성 시 Realtime으로 즉시 반영
