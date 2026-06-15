# 댓글(Comment) 시스템 설계 문서

> 작성일: 2026-06-15
> 상태: **구현 중**
> 브랜치: `feature/comment-system`

---

## 개요

소식(`sch_post_mst`)·대회(`comp_mst`)에 댓글/답글/멘션 기능 추가.
범용 폴리모픽 구조로 나중에 모임(`gthr_mst`)에도 재사용.

---

## 확정 스펙

### 댓글 기능

| 항목 | 결정 |
|------|------|
| 답글 깊이 | 1단계만 (답글의 답글 없음) |
| 답글 달린 댓글 | 수정/삭제 불가 |
| 삭제된 댓글 처리 | `del_yn=true` soft delete. 답글 있으면 "삭제된 댓글입니다" 자리표시자 유지 |
| 수정됨 표시 | `edit_yn=true` → "(수정됨)" 텍스트 표시 |
| 실시간 업데이트 | Supabase Realtime (`postgres_changes`) 구독 |
| 멘션 | `@이름` 자동완성. `cont_txt`에 `@이름` 텍스트 저장, `cmnt_mention_rel`에 mem_id 구조화 |

### 권한

| 행위 | 일반 멤버 | 관리자 |
|------|----------|--------|
| 댓글 작성 | ✅ | ✅ |
| 댓글 수정 | 본인만 (답글 없을 때) | ❌ |
| 댓글 삭제 | 본인만 (답글 없을 때) | ✅ (답글 있어도) |

### 알림 규칙

| 이벤트 | `noti_type_enm` | 수신자 |
|--------|-----------------|--------|
| 댓글에서 멘션됨 | `cmnt_mention` | 멘션된 멤버 |
| 내 댓글에 답글 달림 | `cmnt_reply` | 원댓글 작성자 |
| 모임 댓글 달림 (나중에) | `gthr_cmnt` | 모임 개설자 |

**중첩 알림** (나중에): 같은 엔티티 댓글 알림 여러 개 → 한 줄 + `+N` 묶음 처리

---

## DB 스키마

> 약어 규칙: `.claude/docs/database-abbreviation-dictionary.md`
> 마이그레이션: `supabase/migrations/20260615110000_cmnt_mst.sql`

### `cmnt_mst` — 범용 댓글

```sql
CREATE TABLE public.cmnt_mst (
  cmnt_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES public.team_mst(team_id),
  entity_type  text        NOT NULL
               CHECK (entity_type IN ('sch_post', 'comp', 'gathering')),
  entity_id    uuid        NOT NULL,             -- sch_post_id / comp_id / gthr_id
  prnt_id      uuid        REFERENCES public.cmnt_mst(cmnt_id),  -- null=루트, 있으면 1단계 답글
  mem_id       uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  cont_txt     text        NOT NULL,
  edit_yn      boolean     NOT NULL DEFAULT false,
  del_yn       boolean     NOT NULL DEFAULT false,
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now()
);
```

### `cmnt_mention_rel` — 멘션 관계

```sql
CREATE TABLE public.cmnt_mention_rel (
  cmnt_id  uuid NOT NULL REFERENCES public.cmnt_mst(cmnt_id),
  mem_id   uuid NOT NULL REFERENCES public.mem_mst(mem_id),
  PRIMARY KEY (cmnt_id, mem_id)
);
```

### RLS 요약

| 테이블 | SELECT | INSERT | UPDATE |
|--------|--------|--------|--------|
| `cmnt_mst` | 팀 멤버 전체 (del_yn 무관 — 자리표시자용) | 팀 멤버 본인 작성 | 본인 OR 관리자 |
| `cmnt_mention_rel` | 팀 멤버 | service role만 | — |

---

## 컴포넌트 구조

```
components/comment/
├── mention-input.tsx      -- @멘션 자동완성 입력창 (독립 재사용 가능)
├── comment-item.tsx       -- 댓글 단일 아이템 (수정/삭제/답글 버튼)
└── comment-section.tsx    -- 댓글 목록 + 입력창 + Realtime 구독
```

### 재사용 방법

`entityType`과 `entityId`만 넘기면 어디서든 붙일 수 있음:

```tsx
// 소식
<CommentSection entityType="sch_post" entityId={schPostId} ... />

// 대회
<CommentSection entityType="comp" entityId={compId} ... />

// 모임 (나중에)
<CommentSection entityType="gathering" entityId={gthrId} ... />
```

### MentionInput 재사용

댓글 외에 글쓰기, 모임 생성 비고란 등 텍스트 입력이 있는 곳이면 어디든:

```tsx
import { MentionInput } from "@/components/comment/mention-input"

<MentionInput
  value={text}
  onChange={setText}
  onMentionsChange={setMentionedIds}
  members={members}  // { mem_id, mem_nm }[]
  placeholder="내용 입력..."
/>
```

---

## 서버 액션

| 함수 | 파일 | 설명 |
|------|------|------|
| `createComment` | `app/actions/comment/manage-comment.ts` | 작성 + 멘션 저장 + 알림 |
| `updateComment` | 동일 | 수정 (답글 없는 본인 댓글만) + 멘션 갱신 |
| `deleteComment` | 동일 | soft delete (본인 또는 관리자) |
| `getCommentData` | `app/actions/comment/get-comment-data.ts` | 초기 댓글 목록 + 팀 멤버 목록 조회 |

---

## 알림 타입

`noti_mst.noti_type_enm` CHECK 제약:
```
'ttl_grnt', 'adm_cust', 'dues_check_req', 'dues_notice', 'cmnt_reply', 'cmnt_mention'
```
마이그레이션: `supabase/migrations/20260615120000_cmnt_noti_types.sql`

---

## 기타 사항

- `sch_post` → `sch_post_mst` 테이블 리네임: 마이그레이션 완료 (`20260615100000`), 코드 참조 5곳 업데이트 필요 (Task 1에서 처리)
- Realtime은 `entity_id=eq.{entityId}` 필터로 해당 엔티티 댓글만 구독
- `mem_nm`은 Realtime payload에 포함되지 않으므로, INSERT 이벤트 수신 시 `members` prop에서 `mem_id`로 조회

---

## 관련 문서

- `gathering-design.md` — 모임 기능 (댓글 연동 예정)
- `schedule-feature-progress.md` — `sch_post_mst` 리네임 작업 포함
- `notice-update-notification.md` — 알림 시스템 구조
- `database-abbreviation-dictionary.md` — DB 약어 규칙
