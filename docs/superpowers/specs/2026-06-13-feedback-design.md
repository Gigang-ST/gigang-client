# 피드백 기능 설계 — 2026-06-13

## 개요

프로필 페이지에서 접근할 수 있는 의견 제출 공간을 추가한다.
gym-with-you 프로젝트의 피드백 시스템을 참조해 리워드 기능만 제거한 형태로 구현한다.

---

## 데이터 구조

### 테이블: `public.feedback_messages`

```sql
CREATE TABLE public.feedback_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body         TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status       TEXT        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'in_review', 'done')),
  admin_note   TEXT        CHECK (char_length(admin_note) <= 2000),
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_messages_created_idx ON public.feedback_messages (created_at DESC);
```

### RLS 정책

| 정책명 | 대상 | 권한 |
|--------|------|------|
| `feedback_self_insert` | 본인 | INSERT (user_id = auth.uid()) |
| `feedback_self_select` | 본인 | SELECT 본인 행만 |
| `feedback_admin_select` | 관리자 | SELECT 전체 |
| `feedback_admin_update` | 관리자 | UPDATE (status, admin_note, responded_at) |
| `feedback_admin_delete` | 관리자 | DELETE |

관리자 판별은 기존 `verifyAdmin()` 패턴 사용.

---

## 파일 구조

```
supabase/migrations/
└── YYYYMMDDHHMMSS_feedback.sql          # 테이블 + RLS

app/
├── (info)/profile/feedback/
│   └── page.tsx                         # 사용자 피드백 페이지
├── (info)/admin/feedback/
│   └── page.tsx                         # 관리자 피드백 관리
└── actions/feedback/
    ├── submit-feedback.ts               # 피드백 제출 (사용자)
    ├── update-feedback-status.ts        # 상태 변경 (관리자)
    └── respond-feedback.ts              # 답변 저장 (관리자)

components/feedback/
├── feedback-form.tsx                    # 작성 폼 (textarea + 제출)
├── feedback-list.tsx                    # 내 피드백 목록 (상태 배지 + 답변)
└── feedback-admin-list.tsx              # 관리자용 전체 목록 + 액션

lib/validations/
└── feedback.ts                          # Zod 스키마
```

---

## 페이지 설계

### 사용자 피드백 페이지 (`/profile/feedback`)

레이아웃: `(info)` 그룹 — BackHeader 자동 적용.

**상단: 작성 폼**
- `CardItem` 래퍼
- `textarea` — 최대 2000자, 플레이스홀더: "불편한 점, 개선 아이디어 등 자유롭게 남겨주세요"
- 제출 버튼 (로딩 상태 포함)

**하단: 내가 보낸 의견 목록**
- `SectionHeader` — "내가 보낸 의견"
- 없을 때: `EmptyState`
- 항목별 표시:
  - 날짜 (`dayjs(created_at).format("YY.MM.DD")`)
  - 상태 배지: `접수됨` / `확인 중` / `처리 완료`
  - 본문 (토글 없이 전체 표시)
  - 개발자 답변 — `admin_note` 있을 때만 하늘색 박스로 표시

### 프로필 메인 페이지 변경

기존 빠른 링크(내 정보 수정 / 계좌 관리 / 회비 조회) 목록에 항목 추가:
```
의견 보내기  →  /profile/feedback
```

### 관리자 피드백 페이지 (`/admin/feedback`)

기존 어드민 탭 구조에 "의견함" 탭 추가.

**목록 항목:**
- 작성자 이름 + 날짜
- 본문 (전체 표시)
- 상태 전환 버튼: `접수됨 → 확인 중 → 처리 완료`
- 답변 textarea + 저장 버튼 (저장 시 `responded_at` 자동 기록)

---

## 서버 액션

### `submitFeedbackAction(body: string)`
- 로그인 확인 → `feedback_messages` INSERT
- revalidate: `/profile/feedback`

### `updateFeedbackStatusAction(id: string, status: Status)`
- `verifyAdmin()` → UPDATE status
- revalidate: `/admin/feedback`

### `respondFeedbackAction(id: string, adminNote: string)`
- `verifyAdmin()` → UPDATE admin_note, responded_at = now()
- revalidate: `/admin/feedback`, `/profile/feedback` (전체 revalidatePath)

---

## Zod 스키마 (`lib/validations/feedback.ts`)

```typescript
export const feedbackSchema = z.object({
  body: z.string().min(1, "내용을 입력해주세요").max(2000, "2000자 이내로 작성해주세요"),
});

export const adminRespondSchema = z.object({
  adminNote: z.string().max(2000).optional(),
  status: z.enum(["open", "in_review", "done"]),
});
```

---

## 상태 배지 색상

| 상태 | 레이블 | 색상 |
|------|--------|------|
| `open` | 접수됨 | `--muted` (회색) |
| `in_review` | 확인 중 | `--warning` (주황) |
| `done` | 처리 완료 | `--success` (초록) |

---

## 범위 외 (이번 구현에서 제외)

- 리워드 시스템 (별, 기프티콘)
- 피드백 삭제 (사용자 측)
- page_path 필드
