# 마일리지런 프로젝트 탭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 탭에 마일리지런 기능을 완전히 구현한다 (유틸리티, 서버 액션, UI 14개 컴포넌트).

**Architecture:** 기존 `feat/events-mileage-run` 브랜치의 계산 유틸(`lib/mileage.ts`)을 포팅하고, 서버 액션과 UI는 V2 DB 스키마 + 현재 dev 패턴(nuqs, getRequestTeamContext, createAdminClient)에 맞춰 새로 작성한다. 날짜 함수는 기존 `lib/dayjs.ts`를 사용하고 `lib/mileage.ts`에서는 중복 정의하지 않는다.

**Tech Stack:** Next.js App Router, Supabase (V2 스키마), React Hook Form + Zod, Recharts, shadcn/ui, nuqs, dayjs

**Spec:** `docs/superpowers/specs/2026-04-18-mileage-run-design.md`

**기존 코드 참조:** `git show origin/feat/events-mileage-run:<path>` 로 기존 구현 확인 가능

---

## 파일 구조

### 신규 생성
| 파일 | 역할 |
|------|------|
| `lib/mileage.ts` | 마일리지 계산 유틸 (기존 브랜치에서 포팅, dayjs import로 교체) |
| `lib/validations/mileage.ts` | Zod 스키마 (기록 입력, 목표 수정, 참여 신청) |
| `app/actions/mileage-run.ts` | 서버 액션 7개 (V2 DB 기준) |
| `components/projects/join-section.tsx` | 참여 신청 폼 |
| `components/projects/crew-progress-chart.tsx` | 크루 누적 그래프 (Recharts) |
| `components/projects/chart-mode-context.tsx` | 차트 모드 Context (마일리지/%) |
| `components/projects/crew-monthly-stats.tsx` | 당월 크루 통계 (서버→클라이언트) |
| `components/projects/random-review.tsx` | 최근 후기 랜덤 표시 |
| `components/projects/my-status.tsx` | 내 현황 카드 |
| `components/projects/refund-status.tsx` | 환급/회식비 표시 |
| `components/projects/my-sport-chart.tsx` | 종목별 도넛 차트 |
| `components/projects/my-activity-list.tsx` | 내 기록 목록 (서버→클라이언트) |
| `components/projects/activity-log-fab.tsx` | FAB 버튼 |
| `components/projects/activity-log-form.tsx` | 기록 입력 폼 (Sheet 내부) |

### 수정
| 파일 | 변경 내용 |
|------|----------|
| `app/(main)/projects/page.tsx` | MOCK_PROJECT 제거, V2 DB 연동, 전체 컴포넌트 조립 |
| `components/projects/mileage-rules-button.tsx` | 신규 생성 (MileageRulesContent를 Sheet로 감싸기) |

### 기존 유지
| 파일 | 비고 |
|------|------|
| `components/projects/mileage-intro.tsx` | 그대로 사용 |
| `components/projects/mileage-rules-content.tsx` | 그대로 사용 |
| `components/projects/month-navigator.tsx` | 이미 dev에 존재, 그대로 사용 |

---

## Task 1: 마일리지 계산 유틸리티

**Files:**
- Create: `lib/mileage.ts`

- [ ] **Step 1: `lib/mileage.ts` 작성**

기존 브랜치의 `lib/mileage.ts`를 포팅한다. 날짜 함수(`todayKST`, `currentMonthKST` 등)는 `lib/dayjs.ts`에 이미 있으므로 제거하고, 순수 비즈니스 로직만 남긴다.

```typescript
// lib/mileage.ts
export type MileageSport = "RUNNING" | "TRAIL" | "CYCLING" | "SWIMMING";

export const MILEAGE_SPORT_LABELS: Record<MileageSport, string> = {
  RUNNING: "러닝",
  TRAIL: "트레일러닝",
  CYCLING: "자전거",
  SWIMMING: "수영",
};

export function calcBaseMileage(
  sport: MileageSport,
  distanceKm: number,
  elevationM: number,
): number {
  switch (sport) {
    case "RUNNING":
    case "TRAIL":
      return distanceKm + elevationM / 100;
    case "CYCLING":
      return distanceKm / 4 + elevationM / 100;
    case "SWIMMING":
      return distanceKm * 3;
  }
}

export function calcFinalMileage(
  baseMileage: number,
  multipliers: number[],
): number {
  return multipliers.reduce((acc, m) => acc * m, baseMileage);
}

export function calcNextMonthGoal(currentGoal: number, achieved: boolean): number {
  if (!achieved) return currentGoal;
  if (currentGoal < 50) return currentGoal + 10;
  if (currentGoal < 100) return currentGoal + 15;
  return currentGoal + 20;
}

export function calcMonthRefundRate(
  achievedMileage: number,
  goalKm: number,
): number {
  if (goalKm === 0) return 0;
  return Math.min(achievedMileage / goalKm, 1.0);
}

export function calcPaceRatio(
  currentMileage: number,
  goalKm: number,
  todayDay: number,
  totalDays: number,
): number {
  if (goalKm === 0) return 0;
  const progressRatio = currentMileage / goalKm;
  const timeRatio = todayDay / totalDays;
  if (timeRatio === 0) return 0;
  return progressRatio / timeRatio;
}

export function calcDailyNeeded(
  currentMileage: number,
  goalKm: number,
  todayDay: number,
  totalDays: number,
): number | "done" {
  if (currentMileage >= goalKm) return "done";
  const remaining = goalKm - currentMileage;
  const remainingDays = totalDays - todayDay + 1;
  if (remainingDays <= 0) return 0;
  return remaining / remainingDays;
}

export function countMonths(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max((ty - fy) * 12 + (tm - fm) + 1, 0);
}

export const DEPOSIT_PER_MONTH = 10_000;
export const ENTRY_FEE = 10_000;
export const SINGLET_FEE = 10_000;

export function roundMileage(value: number): number {
  return Math.round(value * 100) / 100;
}
```

종목 코드를 V2 DB의 `sport_cd`와 일치시킨다 (`RUNNING`, `TRAIL`, `CYCLING`, `SWIMMING`).

- [ ] **Step 2: 커밋**

```bash
git add lib/mileage.ts
git commit -m "feat: 마일리지 계산 유틸리티 포팅 (lib/mileage.ts)"
```

---

## Task 2: Zod 검증 스키마

**Files:**
- Create: `lib/validations/mileage.ts`

- [ ] **Step 1: Zod 스키마 작성**

```typescript
// lib/validations/mileage.ts
import { z } from "zod";

export const activityLogSchema = z.object({
  act_dt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sport_cd: z.enum(["RUNNING", "TRAIL", "CYCLING", "SWIMMING"]),
  distance_km: z.number().positive("거리를 입력해주세요"),
  elevation_m: z.number().min(0).default(0),
  applied_mult_ids: z.array(z.string().uuid()).default([]),
  review: z.string().max(200).optional(),
});

export type ActivityLogInput = z.infer<typeof activityLogSchema>;

export const joinProjectSchema = z.object({
  evt_id: z.string().uuid(),
  init_goal: z.number().int().min(10, "최소 10 이상"),
  has_singlet: z.boolean(),
});

export type JoinProjectInput = z.infer<typeof joinProjectSchema>;

export const updateGoalSchema = z.object({
  goal_id: z.string().uuid(),
  new_goal: z.number().int().min(10),
});

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
```

- [ ] **Step 2: 커밋**

```bash
git add lib/validations/mileage.ts
git commit -m "feat: 마일리지런 Zod 검증 스키마 추가"
```

---

## Task 3: 서버 액션

**Files:**
- Create: `app/actions/mileage-run.ts`

- [ ] **Step 1: 서버 액션 작성**

기존 브랜치의 `app/actions/mileage-run.ts` 로직을 참고하되 V2 DB 스키마에 맞춰 작성한다.

핵심 차이점:
- `member.id` → `mem_mst.mem_id` (getCurrentMember 사용)
- `project_participation` → `evt_team_prt_rel`
- `activity_log` + `activity_log_event` → `evt_mlg_act_hist` (applied_mults jsonb)
- `mileage_goal` → `evt_mlg_goal_cfg`
- `event_multiplier` → `evt_mlg_mult_cfg`
- admin 체크: `checkIsAdmin()` → `verifyAdmin()`
- 클라이언트: `createClient()` (서버) → `createAdminClient()` (service role)

구현할 액션 7개:
1. `joinProject(input)` — 참여 신청 → `evt_team_prt_rel` INSERT + 첫 `evt_mlg_goal_cfg` INSERT
2. `logActivity(evtId, input)` — 기록 입력. 날짜 검증, 배율 스냅샷 조회 → `evt_mlg_act_hist` INSERT
3. `updateActivity(actId, input)` — 기록 수정. 날짜 검증 → UPDATE
4. `deleteActivity(actId, actDt)` — 기록 삭제. 날짜 검증 → DELETE
5. `updateMonthlyGoal(goalId, newGoal)` — 목표 상향 (14일까지, 상향만)
6. `ensureCurrentMonthGoal(evtId, memId, evtEndDt)` — 당월 목표 lazy 생성
7. `ensureAllCurrentMonthGoals(evtId, evtEndDt)` — 전체 참여자 목표 일괄 생성

모든 액션: `{ ok: boolean; message: string | null; data?: T }` 리턴.
`revalidatePath("/projects")` 호출.

기존 브랜치 코드를 `git show origin/feat/events-mileage-run:app/actions/mileage-run.ts`로 참조하여 날짜 잠금 로직, 배율 스냅샷 로직, 목표 자동상향 로직을 그대로 가져온다.

- [ ] **Step 2: 커밋**

```bash
git add app/actions/mileage-run.ts
git commit -m "feat: 마일리지런 서버 액션 7개 구현 (V2 DB)"
```

---

## Task 4: ChartModeContext + MileageRulesButton

**Files:**
- Create: `components/projects/chart-mode-context.tsx`
- Create: `components/projects/mileage-rules-button.tsx`

- [ ] **Step 1: ChartModeContext 작성**

기존 브랜치의 `chart-mode-context.tsx`를 참조. 마일리지/% 토글 상태를 크루 차트와 통계 컴포넌트가 공유하기 위한 Context.

```typescript
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

type ChartMode = "mileage" | "percent";

const ChartModeContext = createContext<{
  mode: ChartMode;
  setMode: (m: ChartMode) => void;
}>({ mode: "mileage", setMode: () => {} });

export function ChartModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ChartMode>("mileage");
  return (
    <ChartModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ChartModeContext.Provider>
  );
}

export function useChartMode() {
  return useContext(ChartModeContext);
}
```

- [ ] **Step 2: MileageRulesButton 작성**

기존 `MileageRulesContent`를 Sheet로 감싸는 버튼 컴포넌트.

```typescript
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BookOpen } from "lucide-react";
import { MileageRulesContent } from "./mileage-rules-content";

export function MileageRulesButton() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full gap-2 rounded-xl">
          <BookOpen className="size-4" />
          마일리지런 규칙
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>마일리지런 규칙</SheetTitle>
        </SheetHeader>
        <MileageRulesContent />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add components/projects/chart-mode-context.tsx components/projects/mileage-rules-button.tsx
git commit -m "feat: ChartModeContext + MileageRulesButton 추가"
```

---

## Task 5: JoinSection (참여 신청)

**Files:**
- Create: `components/projects/join-section.tsx`

- [ ] **Step 1: JoinSection 컴포넌트 작성**

기존 브랜치의 `join-section.tsx`를 참조. 클라이언트 컴포넌트.

기능:
- 목표 선택: 초보(50) / 고수(100) / 자유입력 라디오
- 싱글렛 보유 여부 체크박스
- 보증금 자동 계산 (잔여개월 × 1만 + 참가비 1만 + 싱글렛비)
- `joinProject()` 서버 액션 호출
- 이미 신청했지만 미승인인 경우 "승인 대기 중" 표시

Props: `evtId: string`, `evtStartMonth: string`, `evtEndMonth: string`, `existingPrt: { approve_yn: boolean } | null`

- [ ] **Step 2: 커밋**

```bash
git add components/projects/join-section.tsx
git commit -m "feat: 마일리지런 참여 신청 섹션 구현"
```

---

## Task 6: MyStatus + RefundStatus (내 현황)

**Files:**
- Create: `components/projects/my-status.tsx`
- Create: `components/projects/refund-status.tsx`

- [ ] **Step 1: MyStatus 서버 컴포넌트 작성**

기존 브랜치의 `my-status.tsx` 참조. 서버 컴포넌트로 데이터를 직접 쿼리.

표시 항목:
- 당월 목표 / 현재 마일리지 / 진행률(%)
- 기간 대비 달성률 (`calcPaceRatio`)
- 일일 필요 거리 (`calcDailyNeeded`)
- 목표 수정 버튼 (14일까지)

Props: `evtId: string`, `memId: string`, `month: string`

DB 쿼리 (createAdminClient):
- `evt_mlg_goal_cfg` — 당월 목표
- `evt_mlg_act_hist` — 당월 기록 합산 (final_mlg SUM)

- [ ] **Step 2: RefundStatus 서버 컴포넌트 작성**

기존 브랜치의 `refund-status.tsx` 참조.

표시 항목:
- 환급 예정금 (확정월 + 당월 예상)
- 회식비 예상금 (풀 계산)

Props: `evtId: string`, `memId: string`, `evtStartMonth: string`, `evtEndMonth: string`, `month: string`

DB 쿼리: 전체 참여자의 목표/기록을 조회하여 풀 계산.

- [ ] **Step 3: 커밋**

```bash
git add components/projects/my-status.tsx components/projects/refund-status.tsx
git commit -m "feat: 내 현황 + 환급/회식비 카드 구현"
```

---

## Task 7: CrewProgressChart + RandomReview + CrewMonthlyStats

**Files:**
- Create: `components/projects/crew-progress-chart.tsx`
- Create: `components/projects/random-review.tsx`
- Create: `components/projects/crew-monthly-stats.tsx`

- [ ] **Step 1: CrewProgressChart 클라이언트 컴포넌트**

기존 브랜치 참조. Recharts LineChart.

- X축: 날짜 (월 시작~말일)
- Y축: 누적 마일리지 또는 목표 대비 %
- 크루원별 라인 (top 5 + 본인 강조)
- `useChartMode()`로 마일리지/% 토글
- 클라이언트에서 `createClient()`로 데이터 fetch

Props: `evtId: string`, `memId?: string`, `month: string`

- [ ] **Step 2: RandomReview 서버 컴포넌트**

`evt_mlg_act_hist`에서 최근 7일 내 `review` not null인 기록 중 랜덤 3건 표시.

Props: `evtId: string`

- [ ] **Step 3: CrewMonthlyStats 서버→클라이언트 컴포넌트**

서버에서 당월 전체 통계 계산 → 클라이언트에 props 전달.
- 총 마일리지, 활동 건수, 참여자 수, 평균 달성률
- StatCard 그리드로 표시

Props: `evtId: string`, `month: string`

- [ ] **Step 4: 커밋**

```bash
git add components/projects/crew-progress-chart.tsx components/projects/random-review.tsx components/projects/crew-monthly-stats.tsx
git commit -m "feat: 크루 진행현황 차트 + 후기 + 통계 구현"
```

---

## Task 8: MySportChart

**Files:**
- Create: `components/projects/my-sport-chart.tsx`

- [ ] **Step 1: MySportChart 서버→클라이언트 컴포넌트**

기존 브랜치 참조. Recharts PieChart (도넛).

서버에서 `evt_mlg_act_hist`를 sport_cd별 GROUP BY → 클라이언트에 전달.
종목별 색상은 `sport-*` CSS 변수 토큰 사용.

Props: `evtId: string`, `memId: string`, `month: string`

- [ ] **Step 2: 커밋**

```bash
git add components/projects/my-sport-chart.tsx
git commit -m "feat: 종목별 마일리지 도넛 차트 구현"
```

---

## Task 9: MyActivityList

**Files:**
- Create: `components/projects/my-activity-list.tsx`

- [ ] **Step 1: MyActivityList 서버→클라이언트 컴포넌트**

기존 브랜치 참조.

서버: `evt_mlg_act_hist`에서 해당 월 기록 최신 5건 조회 → 클라이언트 전달.
클라이언트:
- CardItem으로 기록 목록 표시 (날짜, 종목, 거리, 마일리지, 후기)
- 수정/삭제 버튼 (날짜 잠금 상태 표시)
- "더보기" 버튼으로 추가 로딩
- 수정 시 ActivityLogForm을 Sheet로 열기

Props: `evtId: string`, `memId: string`, `month: string`

- [ ] **Step 2: 커밋**

```bash
git add components/projects/my-activity-list.tsx
git commit -m "feat: 내 기록 목록 구현 (수정/삭제, 더보기)"
```

---

## Task 10: ActivityLogFab + ActivityLogForm

**Files:**
- Create: `components/projects/activity-log-fab.tsx`
- Create: `components/projects/activity-log-form.tsx`

- [ ] **Step 1: ActivityLogForm 클라이언트 컴포넌트**

기존 브랜치 참조. React Hook Form + Zod (`activityLogSchema`).

필드:
- 날짜 (date input, 기본값 오늘)
- 종목 (Select: RUNNING/TRAIL/CYCLING/SWIMMING)
- 거리 km (number input)
- 상승고도 m (number input, 수영 시 hidden)
- 이벤트 배율 체크박스 (활성 배율 목록 fetch)
- 후기 (text input)
- 마일리지 미리보기 (calcBaseMileage + calcFinalMileage 실시간 계산)

`logActivity()` / `updateActivity()` 서버 액션 호출.

Props: `evtId: string`, `memId: string`, `editData?: ActivityLog`, `onSuccess: () => void`

- [ ] **Step 2: ActivityLogFab 클라이언트 컴포넌트**

하단 고정 FAB 버튼 → Sheet 열기 → ActivityLogForm 렌더.

Props: `evtId: string`, `memId: string`

- [ ] **Step 3: 커밋**

```bash
git add components/projects/activity-log-fab.tsx components/projects/activity-log-form.tsx
git commit -m "feat: 기록 입력 FAB + 폼 구현"
```

---

## Task 11: 프로젝트 메인 페이지 조립

**Files:**
- Modify: `app/(main)/projects/page.tsx`

- [ ] **Step 1: 페이지 리라이트**

MOCK_PROJECT 제거. V2 DB에서 ACTIVE 이벤트 조회 + 참여 정보 확인 + 전체 컴포넌트 조립.

기존 브랜치의 `page.tsx`를 참조하되 V2 패턴으로:
- `getCurrentMember()` 로 멤버 조회
- `createAdminClient()` 로 `evt_team_mst` 조회 (status_cd = 'ACTIVE')
- `evt_team_prt_rel` 에서 참여 정보 조회
- `ensureAllCurrentMonthGoals()` 호출
- 전체 컴포넌트 Suspense 래핑

```tsx
// 핵심 구조
<div className="flex flex-col gap-0">
  <PageHeader title="프로젝트" />
  <div className="flex flex-col gap-7 px-6 pb-24">
    <MonthNavigator ... />
    {!isParticipant && <MileageIntro />}
    {showJoin && <JoinSection ... />}
    <ChartModeProvider>
      <Suspense><CrewProgressChart ... /></Suspense>
      <Suspense><RandomReview ... /></Suspense>
      <Suspense><CrewMonthlyStats ... /></Suspense>
    </ChartModeProvider>
    {isParticipant && (
      <>
        <Suspense><MyStatus ... /></Suspense>
        <Suspense><RefundStatus ... /></Suspense>
        <Suspense><MySportChart ... /></Suspense>
        <Suspense><MyActivityList ... /></Suspense>
        <ActivityLogFab ... />
      </>
    )}
    <MileageRulesButton />
  </div>
</div>
```

- [ ] **Step 2: 빌드 확인**

```bash
pnpm run build
```

- [ ] **Step 3: 커밋**

```bash
git add app/(main)/projects/page.tsx
git commit -m "feat: 프로젝트 메인 페이지 V2 DB 연동 및 전체 조립"
```

---

## Task 12: 관리자 서버 액션 admin bypass 추가

**Files:**
- Modify: `app/actions/mileage-run.ts`

- [ ] **Step 1: admin bypass 로직 확인**

Task 3에서 이미 `verifyAdmin()` 체크로 날짜 잠금 우회를 구현했는지 확인. 누락되었다면 추가:
- `logActivity`: 전월 3일 제한 admin 우회
- `updateActivity`: 동일
- `deleteActivity`: 동일
- `updateMonthlyGoal`: 14일 제한 admin 우회

- [ ] **Step 2: 커밋 (변경 있는 경우만)**

```bash
git add app/actions/mileage-run.ts
git commit -m "fix: 서버 액션 admin bypass 누락 보완"
```

---

## Task 13: 최종 빌드 + 로컬 확인

- [ ] **Step 1: 린트**

```bash
pnpm run lint
```

- [ ] **Step 2: 빌드**

```bash
pnpm run build
```

- [ ] **Step 3: 오류 수정 후 최종 커밋**

빌드/린트 오류가 있으면 수정하고 커밋.
