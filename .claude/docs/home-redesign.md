# 홈탭 개편 설계 문서

> 브랜치: `feat/home-redesign`  
> 기준 커밋: `6329181`  
> 작성일: 2026-05-31

---

## 1. 개편 배경 및 목표

### 문제
- 적은 정보(활동 멤버 수, 예정 대회 수)가 큰 카드 2개를 차지 → 화면 낭비
- 업커밍 레이스 카드가 너무 많은 공간을 점유
- 최근 기록이 1열로 2개만 표시되고, "더 보기"가 /records 탭 리다이렉트
- 홈 화면에 보여줄 정보가 전반적으로 부족

### 목표
- 기존 정보는 **최대한 압축**해서 공간 확보
- 새로운 **월간 캘린더(SCHEDULE)** 섹션 추가로 일정 한눈에 파악
- 최근 기록을 **2열 그리드**로 더 많이 보여주고 인라인 더보기
- 향후 모임/훈련/대회접수 등 다양한 일정 타입 수용 가능한 확장 구조

---

## 2. 레이아웃 변경 전/후

### Before
```
[헤더: 기강]
[활동 멤버] [예정 대회]   ← CardItem 2개 (grid-cols-2, 큰 카드)
[UPCOMING RACES]
  [카드: 제목/날짜/위치/종목태그]
  [카드: 제목/날짜/위치/종목태그]
[RECENT RECORDS]
  [카드: 이름 · 기록시간]
  [카드: 이름 · 기록시간]
  모두 보기 → /records
[SOCIAL]
```

### After
```
[헤더: 기강]
42명 활동 중 · 3개 대회 참가 예정  ← 한 줄 Caption 텍스트
[SCHEDULE]
  2026년 5월 (미니 캘린더 그리드)
  범례: ● 기강 대회  ● 내 대회
  [날짜 클릭 시 인라인 이벤트 목록]
[UPCOMING RACES]         모두 보기
  D-3  대회명             05/31
  D-14 대회명             06/14
[RECENT RECORDS]
  [이름  1:23:45]  [이름  2:34:56]
  [이름  3:45:67]  [이름  4:56:78]
  더 보기 (8개) ↓
[SOCIAL]
```

---

## 3. 파일 구조

```
app/(main)/
└── page.tsx                          ← 서버 컴포넌트 (데이터 패칭 + 레이아웃)

components/home/
├── mini-calendar.tsx                 ← 신규: 월간 캘린더 (Client)
├── recent-records-grid.tsx           ← 신규: 기록 2열 그리드 + 더보기 (Client)
├── upcoming-races.tsx                ← 수정: 압축 리스트 UI로 변경 (Client)
└── upcoming-races.stories.tsx        ← 기존 (수정 불필요)
```

---

## 4. 컴포넌트 상세 설계

### 4-1. `app/(main)/page.tsx`

#### 데이터 패칭 변경

| 쿼리 | 변경 내용 |
|------|----------|
| `get_public_team_member_stats` | 유지 |
| `get_public_team_competitions` (오늘~) | 유지 — 업커밍 카드용 |
| `get_public_team_competitions` (이달 1일~) | **신규** — 캘린더용 `calendarComps` |
| `comp_mst` count 쿼리 | **제거** — 더 이상 미사용 |
| `get_public_team_recent_records` | `p_limit: 2` → `p_limit: 12` |
| `getCachedCmmCdRows` | 유지 |

#### 오버뷰 렌더링
```tsx
// Before: CardItem 2개 (grid-cols-2)
// After:
<Caption>
  <span className="font-semibold text-foreground">{memberCount}</span>명 활동 중
  {" · "}
  <span className="font-semibold text-foreground">{gigangRaces.length}</span>개 대회 참가 예정
</Caption>
```

#### 캘린더 데이터 가공

```typescript
// 이번 달 기강 대회 (등록자 1명 이상, 말일 이내)
const calendarGigangRaces: CalendarRace[] = (calendarComps ?? [])
  .filter(row => row.reg_count > 0 && row.stt_dt <= monthLastDayStr)
  .map(row => ({ id, title, start_date, type: "gigang" }));

// 이번 달 내 참가 대회 (로그인 시)
const calendarMyRaces: CalendarRace[] = myRaces
  .filter(r => r.start_date >= monthStart && r.start_date <= monthLastDayStr)
  .map(r => ({ id, title, start_date, type: "mine" }));
```

#### 최종 렌더 순서
1. 오버뷰 한 줄 텍스트
2. `<MiniCalendar gigangRaces={...} myRaces={...} />`
3. `<UpcomingRaces ... />`
4. `<RecentRecordsGrid records={...} titleMap={...} initialCount={4} />`
5. `<SocialLinksGrid ... />`

---

### 4-2. `components/home/mini-calendar.tsx`

#### 타입 정의
```typescript
export type CalendarRace = {
  id: string;
  title: string;
  start_date: string;       // "YYYY-MM-DD"
  type: "gigang" | "mine";  // 향후 "meetup" | "info" 등 확장 예정
};
```

#### Props
```typescript
type MiniCalendarProps = {
  gigangRaces: CalendarRace[];  // 서버에서 전달 (이번 달 기강 대회)
  myRaces: CalendarRace[];      // 서버에서 전달 (이번 달 내 참가 대회)
};
```

#### 핵심 로직
- `viewMonth` state로 표시 월 관리 (현재는 이번 달 고정, 이동 버튼 UI만 자리 잡힘)
- `eventMap: Map<string, { gigang: boolean; mine: boolean }>` — 날짜별 이벤트 존재 여부
- `selectedDate` state로 클릭된 날짜 관리
- `selectedEvents` — 선택 날짜의 이벤트 목록 (gigang + mine 합산, 중복 제거)

#### 달력 그리드 구성
```
cells = [null × firstDayOfWeek, 1, 2, ..., totalDays]
grid-cols-7, 요일 헤더(일~토)
```

#### 도트 색상
| 이벤트 타입 | 색상 토큰 |
|------------|----------|
| `gigang` (기강 대회) | `bg-warning` |
| `mine` (내 참가 대회) | `bg-primary` |

#### 날짜 클릭 동작
- 이미 선택된 날짜 재클릭 → 선택 해제
- 이벤트 없는 날짜 클릭 → "일정 없음" 표시
- 이벤트 있는 날짜 → 제목 + 타입별 도트 인라인 표시

#### 향후 확장 포인트
```typescript
// type 필드 확장만으로 새 이벤트 타입 수용 가능
type: "gigang" | "mine" | "meetup" | "info"

// Props 확장
meetupEvents?: CalendarRace[];   // 모임/훈련 일정 (DB 테이블 추가 시)
infoEvents?: CalendarRace[];     // 대회 접수 마감일 등

// 도트 색상 추가
// meetup → bg-success (초록)
// info   → bg-info (파랑 계열)
```

---

### 4-3. `components/home/upcoming-races.tsx`

#### UI 변경
```
Before: CardItem (큰 카드, 제목/날짜/위치/종목 태그 포함)
After:  한 줄 리스트 행 (divide-y)
```

#### 행 구성
```
[D-3 뱃지]  [대회명 truncate]        [MM/DD]
```

#### D-day 뱃지 색상 로직
```typescript
const ddayCls =
  dday === "D-DAY" || dday.startsWith("D+")
    ? "bg-destructive/10 text-destructive"   // 당일 또는 지남
    : ddayNum <= 7
      ? "bg-warning/15 text-warning"          // 7일 이내
      : "bg-secondary text-muted-foreground"; // 여유 있음
```

#### 유지된 기능
- 행 클릭 → `CompetitionDetailDialog` 오픈 (참가 신청/수정/취소)
- `SectionHeader` + "모두 보기 → /races" 링크
- `createRegistration` / `updateRegistration` / `deleteRegistration` 서버 액션

---

### 4-4. `components/home/recent-records-grid.tsx`

#### 타입 정의
```typescript
export type RecentRecord = {
  mem_id: string | null;
  mem_nm: string | null;
  race_nm: string | null;
  evt_cd: string | null;
  rec_time_sec: number | null;
};

export type RecordTitleInfo = {
  ttl_nm: string;
  ttl_desc: string | null;
  desc_visibility: "always" | "others" | "held" | "never";
  badge_effect: string;
  frame_cd: string;
};
```

#### Props
```typescript
type RecentRecordsGridProps = {
  records: RecentRecord[];
  titleMap: Record<string, RecordTitleInfo>;
  initialCount?: number;   // 기본 4 (2열×2줄)
};
```

#### 더보기 로직
```typescript
const [expanded, setExpanded] = useState(false);
const visibleRecords = expanded ? records : records.slice(0, initialCount);
// 서버에서 12개 미리 fetch, 클라이언트에서 4/전체 토글
```

#### 카드 셀 구성 (grid-cols-2)
```
[이름] [칭호배지]
1:23:45               ← font-mono, text-base, font-bold
MARATHON · 대회명     ← Caption, truncate
```

#### 프레임 효과
- `getFrameCls(title?.frame_cd)` — 칭호 프레임 CSS 클래스 적용
- 기존 `page.tsx`에서 인라인으로 처리하던 로직을 컴포넌트 내부로 이동

---

## 5. 데이터 흐름

```
page.tsx (서버)
  │
  ├─ admin.rpc("get_public_team_member_stats")
  │     → memberCount
  │
  ├─ supabase.rpc("get_public_team_competitions", { p_start: today })
  │     → gigangRaces (업커밍 카드용)
  │     → upcomingCards (topGigang + myNext 결정)
  │
  ├─ supabase.rpc("get_public_team_competitions", { p_start: monthStart })
  │     → calendarGigangRaces (캘린더용, 이번 달 필터)
  │
  ├─ supabase.rpc("get_public_team_recent_records", { p_limit: 12 })
  │     → recentRecords
  │
  ├─ admin.from("mem_ttl_rel")
  │     → titleMap (기록 멤버 칭호 정보)
  │
  └─ (로그인 시) comp_reg_rel 쿼리
        → myRegistrations, myRaces
        → calendarMyRaces (캘린더용)
        → initialRegistrationsByCompetitionId (업커밍 카드용)

Props 전달:
  MiniCalendar       ← calendarGigangRaces, calendarMyRaces
  UpcomingRaces      ← upcomingCards, initialRegistrationsByCompetitionId, initialMemberStatus
  RecentRecordsGrid  ← recentRecords, titleMap
  SocialLinksGrid    ← kakaoChatPassword (isMember 시)
```

---

## 6. Skeleton 변경

```
Before:
  [오버뷰 카드 2개]
  [소셜 링크 4개]
  [업커밍 카드 2개]

After:
  [한 줄 텍스트 스켈레톤]
  [캘린더 블록]
  [업커밍 리스트 2줄]
  [기록 그리드 2×2]
  [소셜 링크 4개]
```

---

## 7. 미결 사항 및 다음 작업

### 7-1. 칭호 관련 버그 수정 (이 브랜치에서 진행 예정)
- [ ] 구체적인 버그 내용 파악 후 작성 예정

### 7-2. 캘린더 월 이동 기능
- 현재: 이번 달 고정, 이동 버튼 UI는 `opacity-0 pointer-events-none`으로 숨김
- 필요: 이전/다음 달 클릭 시 해당 월 대회 데이터를 가져오는 서버 액션 또는 클라이언트 패칭 로직
- 방안: `searchParams` 기반 URL 파라미터로 월 상태 관리 (RSC rerender) 또는 클라이언트에서 직접 RPC 호출

### 7-3. 새 캘린더 이벤트 타입
- `"meetup"` — 기강 모임/훈련 일정 (DB 테이블: `team_schedule` 등 신규 설계 필요)
- `"info"` — 대회 접수 마감일 공지

### 7-4. 홈 캘린더 서버 쿼리 최적화
- 현재 `get_public_team_competitions`를 두 번 호출 (오늘 기준, 이달 1일 기준)
- 이달 1일 기준 쿼리 결과로 업커밍도 처리 가능 → 쿼리 1회 절감 가능

### 7-5. 접수 정보 알림 방식
- 대회 접수 마감일을 어떤 데이터로 관리할지 결정 필요
  - `comp_mst`에 `reg_deadline` 컬럼 추가 방안
  - 별도 `team_schedule` 테이블 방안

---

## 8. 관련 파일 참조

| 파일 | 역할 |
|------|------|
| `lib/dayjs.ts` | `todayKST`, `currentMonthKST`, `monthLastDay`, `formatDDay`, `secondsToTime` |
| `lib/title-effects.ts` | `getFrameCls` — 칭호 프레임 CSS 클래스 |
| `components/common/typography.tsx` | `H1`, `Caption`, `Micro`, `SectionLabel` |
| `components/common/section-header.tsx` | `SectionHeader` (label + action 링크) |
| `components/common/empty-state.tsx` | `EmptyState` |
| `components/common/title-badge.tsx` | `TitleBadge` |
| `components/races/competition-detail-dialog.tsx` | 대회 상세/참가 신청 다이얼로그 |
| `components/social-links.tsx` | `SocialLinksGrid` |
| `lib/queries/cmm-cd-cached.ts` | `getCachedCmmCdRows` |
| `lib/queries/member.ts` | `getCurrentMember` |
| `lib/queries/request-team.ts` | `getRequestTeamContext` |