# 모임(Gathering) 기능 설계 문서

> 작성일: 2026-06-06  
> 상태: 설계 중 (구현 전)

---

## 개요

기강 멤버들이 카카오톡 일정 기능을 대체할 수 있도록, 앱 내에서 모임을 개설하고 참석 여부를 관리하는 기능.

**핵심 목표**: 카카오톡과 비슷한 친숙한 UX로 진입 장벽을 낮추고, 앱 하나로 일정 공유 + 참석 관리 + 대화를 모두 처리.

---

## 확정 사항

### 모임 타입

| 타입 | 설명 | 예시 |
|------|------|------|
| `regular` | 정기 모임 | 정기 기강권 (격주 수요일) |
| `event` | 이벤트 | Hyrox 레츠고!, 나이키 협업 |
| `general` | 일반 모임 | 잠수교 세션, 번개 |

### 모임 필드

| 필드 | 필수 | 설명 |
|------|------|------|
| 제목 | ✅ | |
| 타입 | ✅ | regular / event / general |
| 시작 날짜+시간 | ✅ | |
| 종료 시간 | ❌ | 선택 |
| 장소 | ✅ | 텍스트 또는 링크 자유 입력 |
| 비고 | ❌ | 긴 텍스트, 링크 포함 가능 |
| 인원 제한 | ❌ | null = 제한 없음 |

### 권한

| 행위 | 일반 멤버 | 개설자 | 관리자 |
|------|----------|--------|--------|
| 모임 생성 | ✅ | ✅ | ✅ |
| 모임 수정 | ❌ | ✅ | ❌ |
| 모임 삭제 | ❌ | ✅ | ✅ (확인 다이얼로그 필수) |
| 댓글 수정 | 본인만 | 본인만 | ❌ |
| 댓글 삭제 | 본인만 | 본인만 | ✅ (확인 다이얼로그 필수) |

### 참석 응답

- 토글 버튼 하나 (참석/미참석)
- 기본: 회색 (미참석)
- 누르면: 초록 (참석)
- 다시 누르면: 회색 복귀
- DB에 row 존재 여부로 판단 (status 컬럼 없음)

### 색상 체계

| 항목 | 색 | 의미 |
|------|-----|------|
| 대회 (기강 등록) | 주황 | 예정된 대회 |
| 모임 | 파랑 (`--primary`) | 예정된 모임 |
| 참석/참가 확정 | 초록 | 내가 가는 것 (대회/모임 통일) |

---

## DB 스키마

> 약어 규칙은 `.claude/docs/database-abbreviation-dictionary.md` 준수

```sql
-- 모임 마스터
CREATE TABLE gthr_mst (
  gthr_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES team_mst(team_id),
  gthr_type_enm text       NOT NULL CHECK (gthr_type_enm IN ('general', 'regular', 'event')),
  gthr_nm      text        NOT NULL,
  desc_txt     text,                    -- 비고 (긴 텍스트, 링크 포함)
  loc_txt      text,                    -- 장소 (글/링크 자유)
  stt_at       timestamptz NOT NULL,    -- 시작 일시
  end_at       timestamptz,             -- 종료 일시 (선택)
  max_prt_cnt  int,                     -- 인원 제한 (null = 제한 없음)
  crt_by       uuid        NOT NULL REFERENCES mem_mst(mem_id),
  del_yn       boolean     NOT NULL DEFAULT false,
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now()
);

-- 모임 참석 관계 (row 존재 = 참석)
CREATE TABLE gthr_attd_rel (
  attd_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gthr_id      uuid        NOT NULL REFERENCES gthr_mst(gthr_id),
  mem_id       uuid        NOT NULL REFERENCES mem_mst(mem_id),
  crt_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gthr_id, mem_id)              -- 중복 참석 방지
);

-- 모임 댓글
CREATE TABLE gthr_cmnt_mst (
  cmnt_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gthr_id      uuid        NOT NULL REFERENCES gthr_mst(gthr_id),
  prnt_id      uuid        REFERENCES gthr_cmnt_mst(cmnt_id),  -- null = 루트, 있으면 대댓글
  mem_id       uuid        NOT NULL REFERENCES mem_mst(mem_id),
  cont_txt     text        NOT NULL,
  edit_yn      boolean     NOT NULL DEFAULT false,              -- 수정됨 표시
  del_yn       boolean     NOT NULL DEFAULT false,
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now()
);
```

---

## 알림 설계

### 알림 설정 항목 (기존 알림 설정에 추가)

```
신규 일정 알림
├── 정기 모임 (regular)   ON/OFF
├── 이벤트 (event)        ON/OFF
└── 일반 모임 (general)   ON/OFF
```

### 알림 트리거

| 이벤트 | 수신자 |
|--------|--------|
| 신규 모임 생성 | 전체 멤버 (타입별 설정 ON인 사람만) |
| 모임 수정 | 참석자 전원 |
| 모임 삭제 | 참석자 전원 |
| 개설자 댓글 작성 | 참석자 전원 |
| 내 댓글에 답글 | 원댓글 작성자 |
| 멘션 (@이름) | 멘션된 사람 |

---

## 페이지 구조

```
/                         홈 (캘린더 + 일정 리스트)
/gatherings/new           모임 생성
/gatherings/[id]          모임 상세 (전체화면, 카톡 스타일)
```

### 홈 탭 레이아웃

```
홈 탭
├── PageHeader
├── MiniCalendar (기본 뷰)
│   ├── 모임: 파랑 점  →  내 참석 확정: 초록 점
│   ├── 대회: 주황 점  →  내 참가 확정: 초록 점
│   └── 우상단 리스트뷰 전환 버튼
└── 선택된 날짜의 일정 리스트
    ├── 모임  →  참석 토글 버튼 (초록/회색)
    └── 대회  →  기존 참가 버튼
```

### 리스트뷰 (카톡 스타일)

```
전체 일정 (날짜순, 모임 + 대회 혼합)
├── 6.10 수  [파랑] 정기 기강권       [참석 토글]
├── 6.14 일  [파랑] Hyrox 레츠고!    [참석 토글]
├── 6.14 일  [주황] Hyrox 대회       [참가 신청]
└── 6.27 토  [파랑] 잠수교 세션       [참석 토글]
```

### 모임 상세 페이지 (`/gatherings/[id]`)

```
┌─────────────────────────────┐
│ ← 뒤로   정기 기강권   ···  │  (개설자/관리자에게만 ··· 메뉴)
├─────────────────────────────┤
│ [정기] 정기 기강권           │
│ 📅 2026년 6월 10일 (수)      │
│ ⏰ 오후 7:30 ~ 오후 8:30    │
│ 📍 여의도역 9호선 B1 클룸보관함│
│ 👥 참석 3명                  │
│                              │
│ [비고 내용...]               │
│                              │
│      [✅ 참석]               │  ← 토글 버튼
├─────────────────────────────┤
│ 참석자 아바타 목록            │
├─────────────────────────────┤
│ 댓글 목록                    │
│  ┌ 홍길동: 참석합니다!        │
│  └ 김철수: 저도요 ↩ 답글     │
│    └ 박영희: 같이가요~        │
├─────────────────────────────┤
│ [댓글 입력창]                │
└─────────────────────────────┘
```

---

## 통계 / 포인트 / 칭호 (미래 설계)

### 쌓이는 데이터 (별도 테이블 불필요, 집계로 처리)

| 데이터 | 출처 |
|--------|------|
| 멤버별 모임 개설 횟수 | `gathering.created_by` |
| 멤버별 모임 참석 횟수 | `gathering_rsvp` |
| 타입별 참석 횟수 | `gathering + gathering_rsvp JOIN` |
| 연속 참석 streak | `gathering_rsvp` 날짜 계산 |
| 월별/분기별 참석률 | `gathering_rsvp` 집계 |

### 기강 포인트 예시 (미구현)

```
모임 개설 1회    +10pt
모임 참석 1회    +5pt
정기 모임 개근   +보너스
댓글 활동        +1pt
```

### 칭호 예시 (미구현)

```
"개근왕"    — 월 정기모임 전부 참석
"모임장"    — 모임 10회 이상 개설
"터줏대감"  — 1년 이상 활동
"응원단장"  — 댓글 50개 이상
```

---

## 카카오톡 오픈채팅방 챗봇 연동 (v2 목표)

### 구조

```
앱에서 모임 생성
→ Supabase Edge Function (웹훅)
→ 카카오 오픈빌더 챗봇 API
→ 기강 오픈채팅방에 자동 공지 게시
```

### 자동 공지 메시지 형식

```
📌 [새 일정] 정기 기강권

📅 2026년 6월 10일 (수)
⏰ 오후 7:30 ~ 오후 8:30
📍 여의도역 9호선 B1 클룸보관함
👥 인원 제한 없음

✅ 참석 여부 등록: https://gigang.kr/gatherings/abc123

#정기모임
```

### 효과

- 이중 업로드 없음 — 앱 한 번만 올리면 카톡 자동 공지
- 카톡 익숙한 멤버는 카톡에서 확인, 링크로 앱 유입
- 참석 등록은 앱에서 → 자연스러운 앱 전환 유도

### 전제 조건

- 기강 카톡방이 오픈채팅방 ✅ (확인됨)
- 카카오 오픈빌더에서 챗봇 생성 + 오픈채팅방 연결 필요

---

## 카톡 인앱브라우저 대응

카톡에서 링크 클릭 시 카카오 인앱브라우저로 강제 열림 (막을 방법 없음).

### 대응 방안

모임 상세 페이지 상단에 인앱브라우저 감지 배너 표시:

```
┌──────────────────────────────────────┐
│ 앱에서 더 편하게 보기  →  Safari로 열기 │
└──────────────────────────────────────┘
```

- 카톡 인앱브라우저 UA 감지로 자동 노출
- 핵심 기능(참석 토글)은 인앱브라우저에서도 동작

---

## MVP 범위

### MVP에 포함

- [ ] `gathering` / `gathering_rsvp` / `gathering_comment` 테이블 생성
- [ ] 모임 생성 페이지 (`/gatherings/new`)
- [ ] 모임 상세 페이지 (`/gatherings/[id]`) — 참석 토글, 댓글
- [ ] 홈 탭 캘린더에 모임 표시 (파랑/초록)
- [ ] 홈 탭 리스트뷰에 모임 + 대회 혼합 표시
- [ ] 알림 설정 — 신규 일정 카테고리 추가
- [ ] 알림 발송 — 모임 생성/수정/삭제/댓글/멘션

### MVP 이후 (고려사항)

- [ ] 이미지 첨부 (Supabase Storage)
- [ ] 카카오 챗봇 연동 (오픈채팅방 자동 공지)
- [ ] 카톡 인앱브라우저 감지 → 외부 브라우저 유도 배너
- [ ] 기강 포인트 제도
- [ ] 멤버 칭호 시스템
- [ ] 통계 페이지 (멤버별 참석률, 개설 횟수 등)
