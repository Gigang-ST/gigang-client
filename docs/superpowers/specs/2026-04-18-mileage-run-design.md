# 마일리지런 프로젝트 탭 설계

> 2026-04-18 | feat/mileage-run-db 브랜치

## 개요

기강 러닝크루 앱의 "프로젝트" 탭에 마일리지런 기능을 구현한다.
기존 `feat/events-mileage-run` 브랜치의 로직/UI를 참고하되, V2 DB 스키마 + 현재 dev 패턴에 맞춰 새로 작성한다.

## 접근 방식: 하이브리드

- **유틸리티(`lib/mileage.ts`)**: 기존 브랜치에서 포팅 (순수 계산 함수, DB 의존성 없음)
- **UI 컴포넌트**: 현재 dev 패턴(nuqs, getRequestTeamContext, CardItem 등)에 맞춰 새로 작성
- **서버 액션**: V2 테이블 기준으로 새로 작성
- **기존 코드 재사용**: `mileage-intro.tsx`, `mileage-rules-content.tsx` (이미 dev에 있음)

## DB 스키마 (V2, 생성 완료)

| 테이블 | PK | 용도 |
|--------|-----|------|
| `evt_team_mst` | `evt_id` | 팀 이벤트 마스터 |
| `evt_team_prt_rel` | `prt_id` | 이벤트 참여 관계 |
| `evt_mlg_goal_cfg` | `goal_id` | 월별 목표 설정 |
| `evt_mlg_act_hist` | `act_id` | 활동 기록 (applied_mults jsonb) |
| `evt_mlg_mult_cfg` | `mult_id` | 배율 설정 |

FK 참조: `evt_team_mst.team_id` → `team_mst.team_id`, `*.mem_id` → `mem_mst.mem_id`

## 유틸리티: `lib/mileage.ts`

기존 브랜치에서 포팅. 순수 계산 함수:

```typescript
// 종목별 기본 마일리지
calcBaseMileage(sport, distanceKm, elevationM): number
// Running/Trail: distance + elevation/100
// Cycling: distance/4 + elevation/100
// Swimming: distance * 3

// 배율 적용 최종값
calcFinalMileage(base, multipliers[]): number

// 목표 자동상향
calcNextMonthGoal(currentGoal, achieved): number
// <50: +10, 50~99: +15, 100+: +20, 미달성: 유지

// 환급률
calcMonthRefundRate(achieved, goal): number  // min(achieved/goal, 1.0)

// 일일 필요 거리
calcDailyNeeded(goal, achieved, remainingDays): number

// 기간 대비 달성률
calcPaceRatio(progressRate, timeRate): number

// 상수
DEPOSIT_PER_MONTH = 10_000
ENTRY_FEE = 10_000
SINGLET_FEE = 10_000
```

날짜 함수는 기존 `lib/dayjs.ts` 활용 (`todayKST`, `currentMonthKST` 등).

## 서버 액션: `app/actions/mileage-run.ts`

V2 테이블 기준. 모든 액션은 `{ ok: boolean, message: string | null }` 리턴.

| 액션 | 설명 | 권한 |
|------|------|------|
| `joinProject(evtId, initGoal, hasSinglet)` | 참여 신청 → `evt_team_prt_rel` INSERT + 첫 `evt_mlg_goal_cfg` 생성 | 본인 |
| `logActivity(input)` | 기록 입력. 미래 날짜 금지, 전월은 3일까지 (admin 우회) | 본인/admin |
| `updateActivity(actId, input)` | 기록 수정. 동일 날짜 제한 | 본인/admin |
| `deleteActivity(actId)` | 기록 삭제. 동일 날짜 제한 | 본인/admin |
| `updateMonthlyGoal(goalId, newGoal)` | 목표 상향만 가능, 14일까지 (admin 우회) | 본인/admin |
| `ensureCurrentMonthGoal(evtId, memId)` | 당월 목표 lazy 생성 (전월 달성 여부 → 상향 로직) | 시스템 |
| `ensureAllCurrentMonthGoals(evtId)` | 전체 승인된 참여자 목표 일괄 생성 | 시스템 |

## 프로젝트 메인 탭 UI

### 페이지: `app/(main)/projects/page.tsx`

서버 컴포넌트. ACTIVE 상태인 `evt_team_mst` 자동 선택.

```
PageHeader "프로젝트"
├── MonthNavigator (연습월~종료월)
├── [미참여] JoinSection
├── CrewProgressChart + RandomReview
├── CrewMonthlyStats
├── [참여자만] MyStatus
├── [참여자만] MySportChart
├── [참여자만] MyActivityList
├── [참여자만] ActivityLogFab
└── MileageRulesButton
```

### 컴포넌트 (`components/projects/`)

| 컴포넌트 | S/C | 역할 |
|----------|-----|------|
| `MonthNavigator` | C | 월 prev/next, URL param `month` (nuqs) |
| `JoinSection` | C | 목표 선택(50/100/자유), 싱글렛 체크, 보증금 계산, 참여 신청 |
| `CrewProgressChart` | C | Recharts 라인차트, 크루원별 누적 마일리지, 마일리지/% 토글 |
| `CrewMonthlyStats` | S→C | 당월 크루 총 마일리지, 활동 건수, 달성률 |
| `RandomReview` | S | 최근 7일 후기 중 랜덤 3건 |
| `MyStatus` | S | 당월 목표/현재/진행률/기간대비/일일필요 |
| `RefundStatus` | S | 환급 예정금, 회식비 예상금 |
| `MySportChart` | S→C | 종목별 도넛 차트 |
| `MyActivityList` | S→C | 최근 5건 + 더보기, 수정/삭제, 날짜 잠금 표시 |
| `ActivityLogFab` | C | 하단 FAB → Sheet |
| `ActivityLogForm` | C | 날짜/종목/거리/고도/이벤트배율/후기, 마일리지 미리보기 |
| `ChartModeContext` | C | 차트 마일리지/% 토글 공유 |
| `MileageIntro` | C | 재사용 (기존) |
| `MileageRulesContent` | C | 재사용 (기존) |

### 데이터 패칭

- 서버 컴포넌트: `getCurrentMember()` → `createAdminClient()` 또는 service role로 쿼리
- 클라이언트 컴포넌트: `createClient()` → RLS SELECT 정책 통해 조회
- 월 선택: `month` URL param (nuqs `parseAsString`)
- 이벤트: ACTIVE 상태인 `evt_team_mst` 자동 선택

## 관리자 페이지 (구현 완료)

- `/admin/projects` — 이벤트 마스터 CRUD
- `/admin/events` — 배율 관리
- `/admin/participations` — 참여자 승인

추가 사항:
- `logActivity` 서버 액션에 admin bypass (3일 제한 우회)
- `updateMonthlyGoal`에 admin bypass (14일 제한 우회)

## 타이밍 & 잠금 규칙

| 규칙 | 제한 | admin |
|------|------|-------|
| 기록 입력 (당월) | 자유 | - |
| 기록 입력 (전월) | 매월 3일까지 | 우회 |
| 기록 수정/삭제 | 입력과 동일 | 우회 |
| 미래 날짜 기록 | 불가 | 불가 |
| 목표 수정 | 14일까지, 상향만 | 우회 |

## 재무 모델

```
월 환급률 = min(달성 마일리지 / 목표, 1.0)
월 환급액 = 환급률 × 10,000원
총 환급액 = 각 참여월 환급액 합산

회식비 풀 = Σ(보증금 - 환급액) + Σ참가비
1인 상한 = 풀 × (본인 참여개월 / 회식참석자 전체 참여개월 합)
```

## 준수 사항

- `lib/dayjs.ts` 사용 (`new Date()` 금지)
- `lib/env.ts`에서 환경변수 import (`process.env` 금지)
- `getCurrentMember()` 멤버 조회
- Zod 스키마 → `lib/validations/`, React Hook Form `zodResolver`
- 타이포그래피 컴포넌트 (`H1`, `Body`, `Caption` 등)
- 공통 컴포넌트 (`CardItem`, `EmptyState`, `StatCard`, `SectionHeader`)
- CSS 변수 토큰만 (하드코딩 금지)
- `.claude/docs/coding-standards.md`, `.claude/docs/component-conventions.md` 준수
