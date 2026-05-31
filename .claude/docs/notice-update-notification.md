# 공지사항 / 업데이트 / 알림 시스템 설계

> 브랜치: `feat/notice-notification` (예정)  
> 작성일: 2026-05-31

---

## 1. 개요 및 목표

### 문제
- 새 기능을 추가해도 멤버들이 모름 → 사용률 저조
- 공지/운영 안내를 전달할 채널이 카카오톡뿐
- 향후 모임일정·대회접수 등 다양한 이벤트 알림이 필요한데 인프라 없음

### 목표
- **공지사항**: 운영 안내, 기강 사용법 게시판
- **업데이트**: 새 기능 릴리즈 노트 게시판
- **알림함**: 인앱 알림 수신함 (종 모양 아이콘). 향후 PWA 푸시 확장 예정

---

## 2. 홈탭 노출 전략 (핵심 고민 해결)

홈탭에 정보가 이미 가득하므로 **새 섹션을 추가하지 않는다.**  
대신 기존 `PageHeader`의 우측에 아이콘 2개를 배치한다.

```
[기강]                    🔔  📋
 ↑ H1                   알림  공지/업뎃
```

### 아이콘 역할
| 아이콘 | 역할 | 클릭 시 |
|--------|------|---------|
| 🔔 Bell | 알림함 | `/notifications` 페이지로 이동 |
| 📋 Megaphone (또는 Newspaper) | 공지/업데이트 | `/board` 페이지로 이동 |

### 미읽음 뱃지
- 알림: 미읽음 개수 빨간 뱃지 (최대 99+)
- 공지/업데이트: 마지막 확인 시각 이후 새 글 있으면 파란 점 표시

---

## 3. 페이지 구조

```
app/
├── (main)/
│   └── page.tsx                    ← PageHeader에 아이콘 추가
│
└── (info)/
    ├── notifications/
    │   └── page.tsx                ← 알림함 (인앱 알림 목록)
    │
    └── board/
        ├── page.tsx                ← 공지/업데이트 탭 목록
        ├── [id]/
        │   └── page.tsx            ← 게시글 상세
        └── write/
            └── page.tsx            ← 작성 (관리자 + 작성권한 멤버)
```

---

## 4. DB 스키마

### 4-1. `board_post` — 게시글

```sql
CREATE TABLE board_post (
  post_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team_mst(team_id),
  post_type     text NOT NULL CHECK (post_type IN ('notice', 'update')),
  title         text NOT NULL,
  content       text NOT NULL,          -- Markdown
  author_mem_id uuid REFERENCES mem_mst(mem_id),
  is_pinned     boolean DEFAULT false,  -- 상단 고정
  vers          integer DEFAULT 0,
  del_yn        boolean DEFAULT false,
  crt_at        timestamptz DEFAULT now(),
  upd_at        timestamptz DEFAULT now()
);
```

### 4-2. `notification` — 알림

```sql
CREATE TABLE notification (
  noti_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team_mst(team_id),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type     text NOT NULL,          -- 아래 타입 목록 참조
  title         text NOT NULL,
  body          text,
  ref_id        uuid,                   -- 연관 리소스 ID (post_id, comp_id 등)
  ref_type      text,                   -- 'post' | 'competition' | 'title' | 'schedule' ...
  is_read       boolean DEFAULT false,
  vers          integer DEFAULT 0,
  del_yn        boolean DEFAULT false,
  crt_at        timestamptz DEFAULT now()
);
```

### 알림 타입 (`noti_type`) 목록
| 값 | 설명 | ref_type |
|----|------|----------|
| `notice_posted` | 공지 등록 | `post` |
| `update_posted` | 업데이트 등록 | `post` |
| `comp_registered` | 대회 등록됨 | `competition` |
| `title_granted` | 칭호 획득 | `title` |
| `schedule_posted` | 모임/일정 등록 (향후) | `schedule` |
| `admin_custom` | 관리자 수동 알림 | - |

### 4-3. `notification_pref` — 알림 수신 설정

```sql
CREATE TABLE notification_pref (
  pref_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type     text NOT NULL,
  enabled       boolean DEFAULT true,
  UNIQUE (mem_id, noti_type)
);
```

---

## 5. 컴포넌트 설계

### 5-1. 홈탭 헤더 (`app/(main)/page.tsx`)

```tsx
// PageHeader에 action 슬롯 활용
<div className="flex h-14 items-center justify-between px-6">
  <H1>기강</H1>
  <div className="flex items-center gap-2">
    <BoardHeaderIcon />    {/* 공지/업데이트 아이콘 + 새글 dot */}
    <NotificationBell />   {/* 종 아이콘 + 미읽음 뱃지 */}
  </div>
</div>
```

`NotificationBell`, `BoardHeaderIcon` — 클라이언트 컴포넌트.  
미읽음 수는 Supabase realtime 또는 페이지 진입 시 fetch.

### 5-2. 알림함 (`/notifications`)

```
[뒤로가기 헤더: 알림]          [모두 읽음]

━━━ 오늘 ━━━
🏆  SUB3 칭호를 획득했습니다          방금 전
📢  5월 업데이트 안내                 1시간 전

━━━ 이전 ━━━
🏁  2026 서울마라톤이 등록됐습니다    3일 전
```

- 타입별 아이콘: 공지 📢, 업데이트 🆕, 대회 🏁, 칭호 🏆, 모임 👟, 관리자 📣
- 클릭 시 `ref_type` + `ref_id`로 라우팅
  - `post` → `/board/[ref_id]`
  - `competition` → `/races` (대회 다이얼로그 오픈)
  - `title` → `/profile`
- 읽음 처리: 클릭 시 `is_read = true`

### 5-3. 게시판 (`/board`)

```
[뒤로가기 헤더: 공지 / 업데이트]     [✏️ 작성] (권한자만)

  [공지사항]  [업데이트]   ← SegmentControl

  📌 [공지] 기강 앱 사용 가이드          05/30
     [공지] 6월 운영 안내                05/28
  ─────────────────────────────
  🆕 [v1.4] 홈탭 개편 — 캘린더/기록     05/31
     [v1.3] 칭호 시스템 도입             05/15
```

- 상단 고정(`is_pinned`) 게시글은 📌 아이콘
- 업데이트 탭은 버전 태그 표시 (선택)
- 무한스크롤 또는 페이지네이션 (초기엔 20개 고정)

### 5-4. 게시글 상세 (`/board/[id]`)

```
[뒤로가기]

제목
작성자 · 05/31

─────────────
Markdown 렌더링 (react-markdown 또는 remark)
─────────────
```

### 5-5. 알림 설정 (`/settings` 내 추가)

설정 페이지에 `NOTIFICATIONS` 섹션 추가:

```
NOTIFICATIONS
  공지사항          [ON/OFF]
  업데이트          [ON/OFF]
  대회 등록         [ON/OFF]
  칭호 획득         [ON/OFF]
  모임 일정 (예정)  [ON/OFF]
```

---

## 6. 알림 생성 트리거

알림은 **서버 액션 또는 DB 트리거**로 생성.  
초기엔 서버 액션에서 명시적으로 생성, 향후 pg trigger로 이전 가능.

| 이벤트 | 생성 시점 | 대상 |
|--------|----------|------|
| 게시글 등록 | `createPost` 서버 액션 | 팀 전체 멤버 |
| 대회 등록 | `createCompetition` 서버 액션 | 팀 전체 멤버 |
| 칭호 부여 | `grantTitle` 서버 액션 | 해당 멤버 1명 |
| 관리자 직접 발송 | 관리자 페이지 | 선택한 대상 |

`notification_pref`에서 `enabled = false`면 해당 타입 INSERT 스킵.

---

## 7. 파일 구조

```
app/
└── (info)/
    ├── notifications/
    │   └── page.tsx
    └── board/
        ├── page.tsx
        ├── [id]/page.tsx
        └── write/page.tsx

app/actions/
├── create-post.ts
├── delete-post.ts
└── mark-notifications-read.ts

components/
├── common/
│   ├── notification-bell.tsx      ← 헤더 알림 아이콘
│   └── board-header-icon.tsx      ← 헤더 게시판 아이콘
├── notifications/
│   └── notification-item.tsx
└── board/
    ├── post-list.tsx
    ├── post-card.tsx
    └── post-detail.tsx

supabase/migrations/
└── YYYYMMDD_board_notification.sql
```

---

## 8. RLS 정책

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `board_post` | 팀 멤버 전체 | 관리자 + 작성권한 멤버 | 작성자 + 관리자 | 관리자 |
| `notification` | 본인 것만 | 서버(service role) | 본인 것만 | - |
| `notification_pref` | 본인 것만 | 본인 | 본인 | 본인 |

작성권한 멤버는 `team_mem_rel`에 `can_post boolean` 컬럼 추가 또는  
별도 `board_author_rel` 테이블로 관리.

---

## 9. 단계별 구현 순서

### Phase 1 — 게시판 (공지/업데이트)
1. DB 마이그레이션: `board_post` 테이블 + RLS
2. 서버 액션: `createPost`, `deletePost`
3. 게시판 목록/상세 페이지
4. 관리자 작성 폼
5. 홈탭 헤더에 📋 아이콘 + 새글 dot

### Phase 2 — 인앱 알림
1. DB 마이그레이션: `notification`, `notification_pref` + RLS
2. 기존 서버 액션에 알림 생성 로직 추가 (칭호, 대회, 게시글)
3. 알림함 페이지 (`/notifications`)
4. 홈탭 헤더 🔔 아이콘 + 미읽음 뱃지
5. 설정 페이지 알림 수신 ON/OFF

### Phase 3 — 향후 확장
- 모임/일정 이벤트 알림
- PWA Web Push
- 멤버 게시판 (자유게시판 확장)
- 관리자 수동 알림 발송 UI

---

## 10. 미결 사항

- Markdown 렌더링 라이브러리 선택 (`react-markdown` vs `@uiw/react-md-editor`)
- 작성권한 멤버 관리 방식: `team_mem_rel` 컬럼 추가 vs 별도 테이블
- 알림 보존 기간 정책 (예: 90일 후 자동 삭제)
- 미읽음 수 실시간 업데이트: Supabase Realtime vs 폴링