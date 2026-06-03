# 공지사항 / 업데이트 / 알림 시스템 설계

> 브랜치: `feat/notice-notification`  
> 작성일: 2026-06-03 (재작성)

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

홈탭 헤더 우측에 아이콘 2개 배치. **새 섹션 추가 없음.**

```
[기강]  No time to be weak  📋  🔔
 ↑ H1        슬로건         게시판 알림
```

### 아이콘 역할

| 아이콘 | 컴포넌트 | 클릭 시 |
|--------|----------|---------|
| 📋 LayoutList | `BoardPopoverIcon` | 팝오버 열림 (공지/업데이트 목록) |
| 🔔 Bell | `NotificationBellIcon` | 바텀시트 열림 (알림 목록) |

### 미읽음 배지
- **알림**: 미읽음 개수 빨간 뱃지 (최대 99+)
- **게시판**: 2단계 dot 표시
  - 아이콘: 공지/업데이트 중 하나라도 안 읽은 글 있으면 파란 dot
  - 팝오버 탭: 공지사항/업데이트 각 탭별로 미읽음 있으면 파란 dot
  - 게시글 개별 dot 없음 (탭 진입 → 게시글 클릭 → 자동 읽음 처리)

### 비로그인 처리
- **알림 아이콘**: 비로그인 시 비활성 옅은색(`text-muted-foreground/40`)으로 렌더. 클릭 불가.
- **게시판 아이콘**: 비로그인도 클릭 가능. `/board`, `/board/[id]` 접근 허용 (읽음 이력만 기록 안 됨).

### 서버/클라이언트 경계

```tsx
// app/(main)/page.tsx — 서버 컴포넌트
const unreadNotiCount = member ? await getUnreadNotificationCount(member.id) : 0;
const [hasUnreadNotice, hasUnreadUpdate] = member
  ? await Promise.all([
      hasUnreadBoardPost(member.id, teamId, "notice"),
      hasUnreadBoardPost(member.id, teamId, "update"),
    ])
  : [false, false];

// 헤더 우측 영역 (현재 <div className="size-8 shrink-0" /> 자리 교체)
<div className="flex items-center gap-1 shrink-0">
  <BoardPopoverIcon
    hasUnreadNotice={hasUnreadNotice}
    hasUnreadUpdate={hasUnreadUpdate}
    memberId={member?.id}
    teamId={teamId}
  />
  <NotificationBellIcon
    initialCount={unreadNotiCount}
    memberId={member?.id}
    disabled={!member}
  />
</div>
```

---

## 3. UI 패턴 상세

### 3-1. 게시판 팝오버 (`BoardPopoverIcon`)

```
         [기강]  슬로건  📋🔵  🔔
                       ┌──────────────────────────┐
                       │  [공지사항🔵] [업데이트]   │  ← 탭별 dot
                       │──────────────────────────│
                       │ 📌 기강 앱 사용 가이드     │
                       │    05/30                 │
                       │──────────────────────────│
                       │    6월 운영 안내           │
                       │    05/28                 │
                       │──────────────────────────│
                       │         전체 보기 →        │  ← /board 이동
                       └──────────────────────────┘
```

- Radix `Popover` 사용 (shadcn/ui)
- 팝오버 너비: `w-72` (288px), 최대 5개 노출 후 "전체 보기 →"
- 게시글 클릭 → `/board/[id]` 페이지 이동 (팝오버 닫힘)
- "전체 보기 →" 클릭 → `/board` 페이지 이동
- **팝오버 열릴 때 + 탭 전환 시**: 해당 탭 dot 즉시 제거 + `markBoardTypeRead(type)` 서버 액션 호출 → 해당 타입 게시글 전체를 `brd_post_read_hist`에 INSERT
  - 근거: 팝오버 목록에서 제목을 봤으면 "무엇이 올라왔는지 인지"한 것으로 간주. 홈 재진입 시 dot이 반복 노출되는 UX 혼란 방지.
  - `markBoardTypeRead`는 이미 읽은 항목을 제외하고 미읽음 항목만 INSERT.
- 팝오버 내 목록은 **클라이언트에서 fetch** (`useEffect` → `/api/board?type=notice&limit=5`)

> **왜 팝오버인가**: 게시판은 읽기 전용 빠른 접근이 주목적. 탭바를 가리지 않으면서 홈 컨텍스트를 유지함.

### 3-2. 알림 바텀시트 (`NotificationBellIcon`)

```
┌──────────────────────────────┐
│  ──  (드래그 핸들)              │
│  알림                 모두 읽음 │
│──────────────────────────────│
│  ━━━ 오늘 ━━━                 │
│ 🏆 SUB3 칭호 획득        방금 전│
│ 📢 5월 업데이트 안내   1시간 전  │
│──────────────────────────────│
│  ━━━ 이전 ━━━                 │
│ 🏁 서울마라톤 등록됨      3일 전 │
└──────────────────────────────┘
```

- `vaul` (Drawer) 또는 shadcn `Sheet` (bottom) 사용
- 알림 항목 클릭 → `ref_type` + `ref_id`로 라우팅 후 시트 닫힘
- "모두 읽음" 버튼 → 서버 액션 `markAllNotificationsRead()`
- 시트 열 때 `Supabase Realtime` 구독 시작, 닫을 때 구독 해제
- `/notifications` 전체 페이지는 별도 유지 (설정 등에서 접근 가능)

> **왜 바텀시트인가**: 알림은 목록 스크롤이 길어질 수 있고, 모바일 엄지 접근성이 팝오버보다 좋음. DogDrip 캡처처럼 드롭다운보다 자연스러운 모바일 UX.

---

## 4. 페이지 구조

```
app/
├── (main)/
│   └── page.tsx                    ← 헤더 우측 아이콘 2개 추가
│
└── (info)/
    ├── notifications/
    │   └── page.tsx                ← 알림 전체 목록 (바텀시트 "전체 보기" 또는 직접 접근)
    │
    └── board/
        ├── page.tsx                ← 공지/업데이트 전체 목록
        ├── [id]/
        │   └── page.tsx            ← 게시글 상세
        └── write/
            └── page.tsx            ← 작성 (관리자 + post_yn 멤버)
```

---

## 5. DB 스키마

### 도메인 약어

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

> **주의**: `post_nm`은 게시글 제목. `ttl`은 칭호(`ttl_mst`) 전용 예약어이므로 게시글 제목에 사용하지 않음.

### 5-1. `brd_post_mst` — 게시글

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

CREATE INDEX idx_brd_post_mst_active
  ON brd_post_mst(team_id, post_type_enm, crt_at DESC)
  WHERE del_yn = false;
```

### 5-2. `noti_mst` — 알림

```sql
CREATE TABLE noti_mst (
  noti_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team_mst(team_id),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type_enm text NOT NULL,
  noti_nm       text NOT NULL,          -- 알림 제목
  noti_cont     text,                   -- 알림 본문 (선택)
  ref_id        uuid,                   -- 연관 리소스 ID
  ref_type_enm  text,                   -- 'brd_post' | 'comp' | 'ttl' | 'sched'
  read_yn       boolean DEFAULT false,
  vers          integer DEFAULT 0,
  del_yn        boolean DEFAULT false,
  crt_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_noti_mst_unread
  ON noti_mst(mem_id, crt_at DESC)
  WHERE del_yn = false AND read_yn = false;
```

### 알림 타입 (`noti_type_enm`)

| 값 | 설명 | ref_type_enm |
|----|------|----------|
| `notice_post` | 공지 등록 | `brd_post` |
| `update_post` | 업데이트 등록 | `brd_post` |
| `comp_reg` | 대회 등록됨 | `comp` |
| `ttl_grnt` | 칭호 획득 | `ttl` |
| `sched_post` | 모임/일정 등록 (향후) | `sched` |
| `adm_cust` | 관리자 수동 알림 | - |

### 5-3. `noti_pref_cfg` — 알림 수신 설정

```sql
CREATE TABLE noti_pref_cfg (
  pref_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type_enm text NOT NULL,
  enabled_yn    boolean DEFAULT true,
  UNIQUE (mem_id, noti_type_enm)
);
```

### 5-4. `brd_post_read_hist` — 게시글 읽음 이력

```sql
CREATE TABLE brd_post_read_hist (
  post_id   uuid NOT NULL REFERENCES brd_post_mst(post_id),
  mem_id    uuid NOT NULL REFERENCES mem_mst(mem_id),
  read_at   timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, mem_id)
);

CREATE INDEX idx_brd_post_read_hist_mem
  ON brd_post_read_hist(mem_id, post_id);
```

- `/board/[id]` 진입 시 INSERT (`ON CONFLICT DO NOTHING`)
- 팝오버 열기 / 홈 진입 시 미읽음 공지 dot 판단에 사용

```sql
-- 미읽음 게시글 존재 여부 (서버 초기 렌더)
SELECT EXISTS (
  SELECT 1 FROM brd_post_mst bp
  WHERE bp.team_id = $1
    AND bp.del_yn = false
    AND NOT EXISTS (
      SELECT 1 FROM brd_post_read_hist
      WHERE post_id = bp.post_id AND mem_id = $2
    )
);
```

### 5-5. `team_mem_rel` 컬럼 추가 — 게시 권한

```sql
ALTER TABLE team_mem_rel ADD COLUMN post_yn boolean DEFAULT false;
```

---

## 6. 알림 생성 — DB 함수 방식

서버 액션에서 N명 개별 INSERT 대신 **DB 함수 한 번 호출**로 처리.

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
    AND NOT EXISTS (
      SELECT 1 FROM noti_pref_cfg npc
      WHERE npc.mem_id = tmr.mem_id
        AND npc.noti_type_enm = p_noti_type_enm
        AND npc.enabled_yn = false
    );
END;
$$;
```

---

## 7. 알림 90일 자동 삭제 — pg_cron

```sql
SELECT cron.schedule(
  'delete-old-noti-mst',
  '0 18 * * *',   -- 매일 KST 03:00 (UTC 18:00)
  $$
    DELETE FROM noti_mst
    WHERE crt_at < now() - interval '90 days';
  $$
);
```

---

## 8. 컴포넌트 설계

### 8-1. 홈탭 헤더 (`app/(main)/page.tsx`)

```tsx
// 서버에서 초기 상태 조회
const unreadNotiCount = await getUnreadNotificationCount(member?.id);
const hasUnreadPost   = await hasUnreadBoardPost(member?.id, teamId);

// 헤더 우측 (현재 <div className="size-8 shrink-0" /> 자리 교체)
<div className="flex items-center gap-1 shrink-0">
  <BoardPopoverIcon hasNew={hasUnreadPost} memberId={member?.id} teamId={teamId} />
  <NotificationBellIcon initialCount={unreadNotiCount} memberId={member?.id} />
</div>
```

### 8-2. `BoardPopoverIcon` (클라이언트 컴포넌트)

```tsx
// components/board/board-popover-icon.tsx
"use client";

// hasUnreadNotice / hasUnreadUpdate: 서버에서 탭별로 분리 전달
// 팝오버 열릴 때: 현재 탭의 dot 즉시 제거 (클라이언트 state)
// 탭 전환 시: 해당 탭 dot 제거
// 내부에서 fetch("/api/board?type=notice&limit=5") 로 목록 로드
export function BoardPopoverIcon({ hasUnreadNotice, hasUnreadUpdate, memberId, teamId }: Props) { ... }
```

**팝오버 구조**:
- `Popover` (Radix, shadcn) — `align="end"`
- 상단: `SegmentControl` (공지사항🔵 / 업데이트🔵) — 탭별 dot 독립 관리
- **dot 제거 시점**: 팝오버 열릴 때 기본 탭(공지사항) dot 제거, 업데이트 탭 클릭 시 업데이트 dot 제거
- 목록: 최대 5개, `pin_yn=true` 항목 📌 표시
- 하단: "전체 보기 →" → `router.push("/board")`
- 게시글 클릭 → `router.push("/board/[id]")`

### 8-3. `NotificationBellIcon` (클라이언트 컴포넌트)

```tsx
// components/notifications/notification-bell-icon.tsx
"use client";

// initialCount: 서버에서 전달
// 바텀시트 열릴 때 알림 목록 fetch + Realtime 구독 시작
// 닫힐 때 구독 해제
// view: "list" | "settings" — 헤더 ⚙️ 클릭 시 설정 패널로 전환
export function NotificationBellIcon({ initialCount, memberId }: Props) { ... }
```

**바텀시트 구조 — 알림 목록 뷰 (`view="list"`)**:

```
┌──────────────────────────────────┐
│  ──  (드래그 핸들)                  │
│  알림       모두읽음  🗑️   ⚙️    │  ← 🗑️=전체삭제, ⚙️=설정 뷰 전환
│──────────────────────────────────│
│  ━━━ 오늘 ━━━                     │
│ 🔴 🏆 SUB3 칭호 획득   방금 전  →  │  ← 좌스와이프 시 삭제 버튼 노출
│ 🔴 📢 5월 업데이트 안내 1시간 전 →  │
│──────────────────────────────────│
│  ━━━ 이전 ━━━                     │
│  ·  🏁 서울마라톤 등록됨   3일 전 →  │  ← 읽음 항목: 회색 텍스트, dot 없음
│  ·  📣 관리자 공지          1주 전  │  ← ref 없음: → 아이콘 없음
└──────────────────────────────────┘
```

- `Sheet` (shadcn, `side="bottom"`) 또는 `vaul` Drawer
- **미읽음**: 왼쪽 빨간 dot + 텍스트 `text-foreground`
- **읽음**: dot 없음 + 텍스트 `text-muted-foreground`
- **항목 클릭 (왼쪽 영역)**: `read_yn = true` 업데이트만 (이동 없음)
- **`→` 아이콘 클릭**: 해당 페이지로 이동 + 시트 닫힘. `ref_id`가 없는 알림(`adm_cust` 등)은 `→` 미노출
- 날짜 그룹: 오늘 / 이전 (추후: 이번 주 / 이전)
- **무한스크롤**: 초기 20개 로드, 스크롤 끝 도달 시 다음 20개 자동 요청 (Intersection Observer). `crt_at` cursor 기반 페이징

**삭제 처리** (소프트 삭제 — 실제 row 유지, `del_yn = true`):
- **개별 삭제**: 항목을 왼쪽으로 스와이프 → 빨간 🗑️ 버튼 노출 → 클릭 시 `del_yn = true` (서버 액션 `delete-notification.ts`). `vaul` Drawer의 drag 제스처와 충돌하지 않도록 수평 스와이프는 별도 터치 핸들러로 처리. 클라이언트 낙관적 업데이트로 즉시 목록에서 제거.
- **전체 삭제**: 헤더 🗑️ 클릭 → "모든 알림을 삭제할까요?" 확인 Dialog → 확인 시 `deleteAllNotifications()` 서버 액션 (`del_yn = true` 일괄 UPDATE, RLS: `mem_id = auth.uid()`)

**타입별 아이콘**:
| noti_type_enm | 아이콘 | 이동 경로 |
|---|---|---|
| `notice_post` | Megaphone | `/board/[ref_id]` |
| `update_post` | Zap | `/board/[ref_id]` |
| `comp_reg` | Flag | `/races` |
| `ttl_grnt` | Trophy | `/profile` |
| `adm_cust` | Bell | 없음 (`→` 미노출) |

**바텀시트 구조 — 설정 뷰 (`view="settings"`)**:

```
┌──────────────────────────────────┐
│  ──  (드래그 핸들)                  │
│  ← 알림 설정                       │  ← ← 클릭 시 목록 뷰로 복귀
│──────────────────────────────────│
│  공지 알림           ●────  ON   │
│  업데이트 알림        ●────  ON   │
│  대회 등록           ────○  OFF  │
│  칭호 획득           ●────  ON   │
└──────────────────────────────────┘
```

- `noti_pref_cfg` upsert 서버 액션과 Switch 연동
- 설정 변경은 즉시 저장 (debounce 불필요 — Switch 토글 이벤트마다 서버 액션 호출)
- 뷰 전환은 CSS `translate` 또는 조건부 렌더 (애니메이션 선택적)

### 8-4. 게시판 목록 페이지 (`/board`)

```
[뒤로가기: 게시판]                    [✏️] (권한자만)

  [공지사항]  [업데이트]   ← SegmentControl

  📌 기강 앱 사용 가이드              05/30
     6월 운영 안내                   05/28
  ─────────────────────────────────
  🆕 [v1.4] 홈탭 개편                05/31
     [v1.3] 칭호 시스템 도입          05/15
```

- 초기 20개 fetch, 무한스크롤 (Intersection Observer)
- 작성/수정 버튼: `member.admin === true || teamMemRel.post_yn === true`
- 비로그인도 목록 조회 가능 (읽음 이력 기록 안 됨)

### 8-5. 게시글 상세 (`/board/[id]`)

```
[뒤로가기]

제목
작성자 · 05/31

─────────────
Markdown 렌더링 (react-markdown)
─────────────

              [수정]  [삭제]   ← 관리자/작성자만 노출
```

- `react-markdown` 사용
- 관리자/작성자에게만 수정·삭제 버튼 노출
- 수정 → `/board/[id]/edit` 페이지로 이동 (작성 폼 재사용)
- 삭제 → 확인 Dialog → `del_yn = true` 소프트 삭제 후 `/board`로 이동
- 진입 시 `brd_post_read_hist` INSERT (비로그인이면 skip)

### 8-6. 게시글 작성/수정 폼 (`/board/write`, `/board/[id]/edit`)

관리자 페이지에 추가. 에디터는 **`@uiw/react-md-editor`** 사용 (마크다운 WYSIWYG, SSR 지원, 가벼움).

```
[뒤로가기: 게시글 작성]

  종류   [공지사항 ▼]        ← Select
  제목   [                ]  ← Input
  상단고정 [ ] 핀 고정          ← Checkbox

  [──────────────────────]
  [  마크다운 에디터        ]
  [  (미리보기 토글 가능)   ]
  [──────────────────────]

              [취소]  [등록]
```

- `react-hook-form` + `zod` 검증 (`lib/validations/board.ts`)
- 등록 시 → `create-post.ts` 서버 액션 → `create_noti_for_team()` 호출
- 수정 시 → `update-post.ts` 서버 액션 (알림 재발송 없음)
- **에디터 테마**: `next-themes`의 `resolvedTheme`으로 `data-color-mode` 동적 연동 (`"dark"` / `"light"`). 다크모드 시 에디터 배경 어두운 회색으로 자동 전환.

### 8-7. 알림 없을 때 빈 상태

```
┌──────────────────────────────────┐
│  ──                               │
│  알림       모두읽음  🗑️   ⚙️    │
│──────────────────────────────────│
│                                  │
│          🔔                      │  ← Bell 아이콘 (옅은색)
│       아직 알림이 없어요            │
│                                  │
└──────────────────────────────────┘
```

### 8-8. 알림 설정 (`/settings` NOTIFICATIONS 섹션)

```tsx
<SectionLabel>NOTIFICATIONS</SectionLabel>
// noti_type별 Switch 토글 → noti_pref_cfg upsert 서버 액션
```

---

## 9. API Route (게시판 팝오버용)

팝오버는 클라이언트에서 빠르게 fetch해야 하므로 Route Handler 사용.

```
app/api/board/route.ts
  GET ?type=notice|update&limit=5&teamId=...
  → brd_post_mst 목록 반환 (pin_yn DESC, crt_at DESC)
```

인증: Supabase 서버 클라이언트로 팀 멤버 검증 후 응답.

---

## 10. RLS 정책

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `brd_post_mst` | 팀 멤버 전체 | `admin=true` 또는 `post_yn=true` | 작성자 + 관리자 | 관리자 |
| `noti_mst` | `mem_id = auth.uid()` | service role만 | `mem_id = auth.uid()` (`read_yn`, `del_yn` 업데이트) | - (소프트 삭제로 대체) |
| `noti_pref_cfg` | `mem_id = auth.uid()` | `mem_id = auth.uid()` | `mem_id = auth.uid()` | `mem_id = auth.uid()` |
| `brd_post_read_hist` | `mem_id = auth.uid()` | `mem_id = auth.uid()` | - | - |

---

## 11. 파일 구조

```
app/
├── (main)/
│   └── page.tsx                         ← 헤더 우측 아이콘 추가
├── (info)/
│   ├── notifications/page.tsx           ← 알림 전체 목록
│   └── board/
│       ├── page.tsx
│       ├── [id]/page.tsx
│       └── write/page.tsx
└── api/
    └── board/route.ts                   ← 팝오버용 게시판 목록 API

app/actions/
├── create-post.ts
├── update-post.ts
├── delete-post.ts
├── mark-notification-read.ts
├── mark-all-notifications-read.ts
├── delete-notification.ts         ← 개별 소프트 삭제
├── delete-all-notifications.ts    ← 전체 소프트 삭제
└── upsert-noti-pref.ts            ← 알림 수신 설정 토글

lib/queries/
├── notification.ts    ← getUnreadNotificationCount, getNotifications
└── board.ts           ← getBoardPosts, getBoardPost, hasUnreadBoardPost(type 파라미터 포함)

lib/validations/
└── board.ts           ← 게시글 작성/수정 zod 스키마

components/
├── board/
│   ├── board-popover-icon.tsx     ← 헤더 게시판 팝오버 아이콘
│   ├── post-list.tsx
│   ├── post-card.tsx
│   ├── post-detail.tsx
│   └── post-form.tsx              ← 작성/수정 폼 공용 컴포넌트 (@uiw/react-md-editor)
└── notifications/
    ├── notification-bell-icon.tsx ← 헤더 알림 바텀시트 아이콘
    └── notification-item.tsx

supabase/migrations/
└── YYYYMMDD_board_notification.sql
```

---

## 12. 단계별 구현 순서

### Phase 1 — 게시판
1. DB 마이그레이션: `brd_post_mst` + `brd_post_read_hist` + `team_mem_rel.post_yn` + RLS
2. `lib/queries/board.ts` — `getBoardPosts`, `getBoardPost`, `hasUnreadBoardPost(memberId, teamId, type)`
3. `lib/validations/board.ts` — zod 스키마
4. 서버 액션: `create-post.ts`, `update-post.ts`, `delete-post.ts`
5. API Route: `app/api/board/route.ts`
6. 게시판 목록(`/board`) / 상세(`/board/[id]`) / 작성(`/board/write`) / 수정(`/board/[id]/edit`) 페이지
7. `post-form.tsx` 공용 폼 컴포넌트 (`@uiw/react-md-editor` 포함)
8. `BoardPopoverIcon` 컴포넌트 + 홈 헤더 연결 (`hasUnreadNotice`, `hasUnreadUpdate` props)

### Phase 2 — 인앱 알림
1. DB 마이그레이션: `noti_mst` + `noti_pref_cfg` + RLS + `create_noti_for_team` 함수 + pg_cron
2. `lib/queries/notification.ts` — `getUnreadNotificationCount`, `getNotifications(cursor, limit=20)`
3. 기존 서버 액션에 알림 생성 추가 (칭호 부여, 대회 등록, 게시글 작성)
4. 서버 액션: `mark-notification-read.ts`, `mark-all-notifications-read.ts`, `delete-notification.ts`, `delete-all-notifications.ts`, `upsert-noti-pref.ts`
5. `NotificationBellIcon` + 바텀시트 (vaul Drawer, Realtime 구독, 무한스크롤, 설정 뷰 전환)
6. `/notifications` 전체 목록 페이지
7. 설정 페이지 NOTIFICATIONS 섹션

### Phase 3 — 향후 확장
- PWA Web Push
- 모임/일정 이벤트 알림
- 관리자 수동 알림 발송 UI
