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

## 2. 홈탭 노출 전략

홈탭에 정보가 이미 가득하므로 **새 섹션을 추가하지 않는다.**  
기존 `PageHeader`의 `action` prop에 아이콘 2개를 배치한다.

```
[기강]                    🔔  📋
 ↑ H1                   알림  공지/업뎃
```

### 아이콘 역할
| 아이콘 | 역할 | 클릭 시 |
|--------|------|---------|
| 🔔 Bell | 알림함 | `/notifications` 페이지로 이동 |
| 📋 Megaphone | 공지/업데이트 | `/board` 페이지로 이동 |

### 미읽음 뱃지
- 알림: 미읽음 개수 빨간 뱃지 (최대 99+)
- 공지/업데이트: 마지막 확인 시각 이후 새 글 있으면 파란 점 표시

### 서버/클라이언트 경계
```tsx
// app/(main)/page.tsx — 서버 컴포넌트
// 초기 미읽음 count를 서버에서 fetch → props로 전달
const unreadCount = await getUnreadNotificationCount(member?.id);
const hasNewPost = await hasNewBoardPost(member?.id);

// PageHeader action prop 활용 (직접 div 대신 PageHeader 컴포넌트로 교체)
<PageHeader
  title="기강"
  action={
    <div className="flex items-center gap-2">
      <BoardHeaderIcon hasNew={hasNewPost} />
      <NotificationBell initialCount={unreadCount} />
    </div>
  }
/>
```

`NotificationBell` — 클라이언트 컴포넌트. `initialCount`로 초기 렌더 후  
Supabase Realtime `notification` 테이블 구독으로 실시간 업데이트.

`BoardHeaderIcon` — 클라이언트 컴포넌트. 클릭 시 `/board`로 이동하며  
`last_seen_board_at` (localStorage 또는 DB) 기준으로 새글 dot 표시.

---

## 3. 페이지 구조

```
app/
├── (main)/
│   └── page.tsx                    ← PageHeader action에 아이콘 추가
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
            └── page.tsx            ← 작성 (관리자 + can_post 멤버)
```

---

## 4. DB 스키마

### 신규 도메인 약어 (이 시스템에서 추가)
| 약어 | 의미 |
|------|------|
| `brd` | board (게시판) |
| `noti` | notification (알림) |
| `cont` | content (본문 내용) |
| `pref` | preference (수신 설정) |
| `pin` | pinned (상단 고정) |
| `read` | read (읽음 여부) |
| `ref` | reference (연관 리소스 참조) |
| `writ` | writer (작성자) |
> **주의**: `post_nm`은 게시글 제목. `ttl`은 칭호(`ttl_mst`) 전용으로 예약되어 있으므로 게시글 제목에 사용하지 않는다.

### 4-1. `brd_post_mst` — 게시글

```sql
CREATE TABLE brd_post_mst (
  post_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team_mst(team_id),
  post_type_enm text NOT NULL CHECK (post_type_enm IN ('notice', 'update')),
  post_nm       text NOT NULL,          -- 게시글 제목
  post_cont     text NOT NULL,          -- 게시글 본문 (Markdown)
  writ_mem_id   uuid REFERENCES mem_mst(mem_id),
  pin_yn        boolean DEFAULT false,  -- 상단 고정
  vers          integer DEFAULT 0,
  del_yn        boolean DEFAULT false,
  crt_at        timestamptz DEFAULT now(),
  upd_at        timestamptz DEFAULT now()
);

-- soft delete 제외 목록 조회용 인덱스
CREATE INDEX idx_brd_post_mst_active
  ON brd_post_mst(team_id, post_type_enm, crt_at DESC)
  WHERE del_yn = false;
```

### 4-2. `noti_mst` — 알림

```sql
CREATE TABLE noti_mst (
  noti_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team_mst(team_id),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type_enm text NOT NULL,          -- 아래 타입 목록 참조
  noti_nm       text NOT NULL,          -- 알림 제목
  noti_cont     text,                   -- 알림 본문 (선택)
  ref_id        uuid,                   -- 연관 리소스 ID (post_id, comp_id 등)
  ref_type_enm  text,                   -- 'brd_post' | 'comp' | 'ttl' | 'sched'
  read_yn       boolean DEFAULT false,
  vers          integer DEFAULT 0,
  del_yn        boolean DEFAULT false,
  crt_at        timestamptz DEFAULT now()
);

-- 미읽음 count 조회용 인덱스
CREATE INDEX idx_noti_mst_unread
  ON noti_mst(mem_id, crt_at DESC)
  WHERE del_yn = false AND read_yn = false;
```

### 알림 타입 (`noti_type_enm`) 목록
| 값 | 설명 | ref_type_enm |
|----|------|----------|
| `notice_post` | 공지 등록 | `brd_post` |
| `update_post` | 업데이트 등록 | `brd_post` |
| `comp_reg` | 대회 등록됨 | `comp` |
| `ttl_grnt` | 칭호 획득 | `ttl` |
| `sched_post` | 모임/일정 등록 (향후) | `sched` |
| `adm_cust` | 관리자 수동 알림 | - |

### 4-3. `noti_pref_cfg` — 알림 수신 설정

```sql
CREATE TABLE noti_pref_cfg (
  pref_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type_enm text NOT NULL,
  enabled_yn    boolean DEFAULT true,
  UNIQUE (mem_id, noti_type_enm)
);
```

### 4-4. `team_mem_rel` 컬럼 추가 — 게시 권한

```sql
-- 작성권한은 team_mem_rel에 컬럼으로 관리 (단일 팀 구조라 별도 테이블 불필요)
ALTER TABLE team_mem_rel ADD COLUMN post_yn boolean DEFAULT false;
```

---

## 5. 알림 생성 — DB 함수 방식

서버 액션에서 N명 개별 INSERT 대신 **DB 함수 한 번 호출**로 처리.  
네트워크 왕복 최소화 + 원자성 보장.

```sql
CREATE OR REPLACE FUNCTION create_noti_for_team(
  p_team_id        uuid,
  p_noti_type_enm  text,
  p_noti_nm        text,
  p_noti_cont      text DEFAULT NULL,
  p_ref_id         uuid DEFAULT NULL,
  p_ref_type_enm   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO noti_mst (team_id, mem_id, noti_type_enm, noti_nm, noti_cont, ref_id, ref_type_enm)
  SELECT
    p_team_id,
    tmr.mem_id,
    p_noti_type_enm,
    p_noti_nm,
    p_noti_cont,
    p_ref_id,
    p_ref_type_enm
  FROM team_mem_rel tmr
  WHERE tmr.team_id = p_team_id
    AND tmr.vers = 0
    AND tmr.del_yn = false
    -- noti_pref_cfg에서 disabled면 제외
    AND NOT EXISTS (
      SELECT 1 FROM noti_pref_cfg npc
      WHERE npc.mem_id = tmr.mem_id
        AND npc.noti_type_enm = p_noti_type_enm
        AND npc.enabled_yn = false
    );
END;
$$;
```

### 서버 액션 호출 예시
```typescript
// app/actions/create-post.ts
await adminClient.rpc("create_noti_for_team", {
  p_team_id: teamId,
  p_noti_type_enm: postTypeEnm === "notice" ? "notice_post" : "update_post",
  p_noti_nm: postNm,
  p_noti_cont: `새 ${postTypeEnm === "notice" ? "공지" : "업데이트"}가 등록됐습니다.`,
  p_ref_id: postId,
  p_ref_type_enm: "brd_post",
});
```

### 단일 멤버 대상 알림 (칭호 부여 등)
```typescript
await adminClient.from("noti_mst").insert({
  team_id: teamId,
  mem_id: targetMemId,
  noti_type_enm: "ttl_grnt",
  noti_nm: `'${ttlNm}' 칭호를 획득했습니다!`,
  ref_id: ttlId,
  ref_type_enm: "ttl",
});
```

---

## 6. 알림 90일 자동 삭제 — pg_cron

```sql
-- pg_cron 확장 활성화 (Supabase 기본 제공)
SELECT cron.schedule(
  'delete-old-noti-mst',
  '0 18 * * *',   -- 매일 KST 03:00 (UTC 18:00)
  $$
    DELETE FROM noti_mst
    WHERE crt_at < now() - interval '90 days';
  $$
);
```

> 마이그레이션 파일에 `cron.schedule` 등록 포함.

---

## 7. 컴포넌트 설계

### 7-1. 홈탭 헤더 (`app/(main)/page.tsx`)

```tsx
// PageHeader action prop 활용
<PageHeader
  title="기강"
  action={
    <div className="flex items-center gap-2">
      <BoardHeaderIcon hasNew={hasNewPost} />
      <NotificationBell initialCount={unreadCount} />
    </div>
  }
/>
```

### 7-2. `NotificationBell` (클라이언트 컴포넌트)

```tsx
// components/common/notification-bell.tsx
"use client";

// initialCount: 서버에서 전달받은 초기 미읽음 수
// Supabase Realtime으로 notification 테이블 구독 → 실시간 업데이트
export function NotificationBell({ initialCount }: { initialCount: number }) { ... }
```

### 7-3. 알림함 (`/notifications`)

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
  - `competition` → `/races`
  - `title` → `/profile`
- 읽음 처리: 클릭 시 `is_read = true`
- 페이지 진입 시 전체 읽음 처리 버튼 (서버 액션)

### 7-4. 게시판 (`/board`)

```
[뒤로가기 헤더: 공지 / 업데이트]     [✏️ 작성] (권한자만)

  [공지사항]  [업데이트]   ← SegmentControl

  📌 [공지] 기강 앱 사용 가이드          05/30
     [공지] 6월 운영 안내                05/28
  ─────────────────────────────
  🆕 [v1.4] 홈탭 개편 — 캘린더/기록     05/31
     [v1.3] 칭호 시스템 도입             05/15
```

- `is_pinned` 게시글 최상단 고정
- 초기 20개 fetch, 무한스크롤 (intersection observer)
- 작성 버튼: `member.admin === true || teamMemRel.can_post === true` 조건

### 7-5. 게시글 상세 (`/board/[id]`)

```
[뒤로가기]

제목
작성자 · 05/31

─────────────
Markdown 렌더링 (react-markdown)
─────────────
```

- `react-markdown` 사용 (SSR 친화적, 가벼움)
- 관리자/작성자에게만 삭제 버튼 노출

### 7-6. 알림 설정 (`/settings` 내 NOTIFICATIONS 섹션 추가)

```tsx
// components/settings/settings-client.tsx에 섹션 추가
// NOTIFICATIONS 섹션
<SectionLabel>NOTIFICATIONS</SectionLabel>
// Bell + 각 noti_type별 Switch 토글
// notification_pref upsert 서버 액션 연동
```

---

## 8. RLS 정책

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `brd_post_mst` | 팀 멤버 전체 | `admin=true` 또는 `post_yn=true` | 작성자 + 관리자 | 관리자 |
| `noti_mst` | `mem_id = auth.uid()` | service role만 | `mem_id = auth.uid()` (`read_yn` 업데이트) | - |
| `noti_pref_cfg` | `mem_id = auth.uid()` | `mem_id = auth.uid()` | `mem_id = auth.uid()` | `mem_id = auth.uid()` |

`brd_post_mst` INSERT 정책:
```sql
CREATE POLICY "brd_post_mst_insert" ON brd_post_mst
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_mem_rel
      WHERE mem_id = auth.uid()
        AND team_id = brd_post_mst.team_id
        AND (admin = true OR post_yn = true)
        AND vers = 0 AND del_yn = false
    )
  );
```

---

## 9. 파일 구조

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

lib/queries/
├── notification.ts          ← getUnreadNotificationCount, getNotifications
└── board.ts                 ← getBoardPosts, getBoardPost

components/
├── common/
│   ├── notification-bell.tsx      ← 헤더 알림 아이콘 (클라이언트)
│   └── board-header-icon.tsx      ← 헤더 게시판 아이콘 (클라이언트)
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

## 10. 단계별 구현 순서

### Phase 1 — 게시판 (공지/업데이트)
1. DB 마이그레이션: `board_post` + `team_mem_rel.can_post` + RLS
2. `lib/queries/board.ts` 쿼리 함수
3. 서버 액션: `create-post.ts`, `delete-post.ts`
4. 게시판 목록/상세 페이지 (`/board`, `/board/[id]`)
5. 관리자 작성 폼 (`/board/write`)
6. 홈탭 `PageHeader` 교체 + `BoardHeaderIcon` 컴포넌트

### Phase 2 — 인앱 알림
1. DB 마이그레이션: `notification` + `notification_pref` + RLS + `create_notifications_for_team` 함수 + pg_cron
2. `lib/queries/notification.ts` 쿼리 함수
3. 기존 서버 액션에 알림 생성 로직 추가 (칭호, 대회, 게시글)
4. 알림함 페이지 (`/notifications`) + `mark-notifications-read.ts` 서버 액션
5. `NotificationBell` 컴포넌트 (Realtime 구독)
6. 설정 페이지 NOTIFICATIONS 섹션 + `notification_pref` 토글

### Phase 3 — 향후 확장
- 모임/일정 이벤트 알림
- PWA Web Push
- 멤버 게시판 (자유게시판 확장)
- 관리자 수동 알림 발송 UI