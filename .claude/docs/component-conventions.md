# 컴포넌트 컨벤션 가이드

## 디렉토리 구조

```
components/
  ui/          # shadcn/ui primitive 컴포넌트만 (Button, Card, Dialog 등)
  common/      # 프로젝트 공통 컴포넌트 (Typography, PageHeader, Avatar 등)
  auth/        # 인증 컴포넌트 (LoginForm, OnboardingForm)
  races/       # 대회 도메인 컴포넌트
  profile/     # 프로필 도메인 컴포넌트 (PersonalBestGrid, RaceRecordDialog, RaceHistoryDialog, PaceChart, RaceRecordSection)
  projects/    # 프로젝트 도메인 컴포넌트 (MonthNavigator)
  home/        # 홈 도메인 컴포넌트 (UpcomingRaces)
  bottom-tab-bar.tsx           # 하단 네비게이션 (5탭: 홈/대회/프로젝트/랭킹/프로필)
  back-header.tsx              # 뒤로가기 헤더
  social-links.tsx             # 소셜 링크
  in-app-browser-gate.tsx      # 인앱브라우저 감지 → 외부 브라우저 유도 래퍼
```

## shadcn/ui 사용법

### 설정
- 스타일: `new-york`
- RSC: true (서버 컴포넌트 기본)
- 경로 별칭: `@/components/ui`

### 새 컴포넌트 추가
```bash
pnpm dlx shadcn@latest add [component-name]
```

### 기존 컴포넌트 목록 (shadcn/ui)
badge, button, card, dialog, form, input, label, loading-spinner, select, separator, skeleton

### 프로젝트 공통 컴포넌트 (`components/common/`)

> 상세 사용법은 `DESIGN.md` 참조

| 컴포넌트 | 파일 | 용도 |
|----------|------|------|
| H1, H2, Body, Caption, Micro, SectionLabel | `typography.tsx` | 시맨틱 타이포그래피 |
| PageHeader | `page-header.tsx` | 메인 페이지 상단 h-14 헤더 (`title`, `action?`) |
| SectionHeader | `section-header.tsx` | 섹션 라벨 + 액션 링크 (`label`, `action?`) |
| EmptyState | `empty-state.tsx` | 빈 상태 표시 (`message`, `icon?`, `variant?: "card" \| "inline"`) |
| SegmentControl | `segment-control.tsx` | 탭 전환 (`segments`, `value`, `onValueChange`) |
| InfoRow | `info-row.tsx` | label-value 행 (`label`, `value?`) |
| Avatar | `avatar.tsx` | 프로필 사진 + 폴백 (`src?`, `size?: "sm"\|"md"\|"lg"\|"xl"`) |
| StatCard | `stat-card.tsx` | 통계 수치 카드 (`value`, `label`, `valueClassName?`) |

### 프로필 도메인 컴포넌트
- `personal-best-grid.tsx` — 읽기 전용 FULL/HALF/10K 최고기록 카드 + 클릭 가능한 UTMB 카드 (다이얼로그에서 UTMB 프로필 URL 입력/수정)
- `race-record-dialog.tsx` — 3단계 위저드 (대회 선택 → 코스 선택 → 시간 입력). 기강대회 중 과거 1개월 내 대회만 표시, 시간 입력 시 분/초 0-59 검증, 철인3종 스플릿(swim/bike/run) 지원
- `race-record-section.tsx` — 기록 입력 버튼 + 이력 보기 버튼 (RaceRecordDialog, RaceHistoryDialog 호출)
- `race-history-dialog.tsx` — 과거 기록 목록, 인라인 시간 수정, 삭제 기능
- `pace-chart.tsx` — recharts LineChart로 종목별 페이스 추이 차트 표시

### 인증 도메인 컴포넌트
- `member-onboarding-form.tsx` — 신규 가입 폼 + inactive 회원 재가입 신청 + pending 회원 승인 대기 메시지 처리. OAuth 프로필 사진(avatar_url) 자동 저장

### 공통 컴포넌트
- `in-app-browser-gate.tsx` — children을 감싸는 래퍼. 카카오톡/인스타/라인/페이스북 인앱 브라우저 감지 시 외부 브라우저 유도 UI 표시. Android는 Chrome intent:// 자동 오픈, iOS는 Safari 안내 + 링크 복사. `<InAppBrowserGate>{children}</InAppBrowserGate>` 형태로 사용

## 컴포넌트 작성 규칙

### 서버 vs 클라이언트
- **서버 컴포넌트** (기본): 데이터 패칭, 정적 렌더링
- **클라이언트 컴포넌트** (`"use client"`): 이벤트 핸들러, 상태, 브라우저 API 필요시

### 네이밍
- 파일: kebab-case (`race-list-view.tsx`)
- 컴포넌트: PascalCase (`RaceListView`)
- 도메인별 하위 디렉토리 사용

### 스타일링
```typescript
import { cn } from "@/lib/utils";

// Tailwind 유틸리티 클래스 사용
<div className={cn("p-4 rounded-2xl", isActive && "bg-primary")}>

// 카드 기본 스타일: rounded-2xl (24px)
// 배지: shadcn Badge 사용
// 다이얼로그: shadcn Dialog 사용
```

### 디자인 토큰 (CSS 변수)
```css
--background: 0 0% 100%;        /* 흰색 */
--foreground: 240 10% 3.9%;     /* 거의 검정 */
--primary: 228 68% 55%;         /* 파란색 #3B5BDB */
--secondary: 240 4.8% 95.9%;    /* 밝은 회색 */
--destructive: 0 84.2% 60.2%;   /* 빨간색 */
--border: 240 5.9% 90%;         /* 테두리 */
--radius: 0.75rem;              /* 12px */
```

### 타이포그래피 (`components/common/typography.tsx`)

**매직넘버(`text-[28px]` 등) 대신 타이포그래피 컴포넌트 사용 필수:**

| 컴포넌트 | 사이즈 | 용도 |
|----------|--------|------|
| `<H1>` | 28px bold | 메인 탭 페이지 제목 |
| `<H2>` | 22px bold | 서브 페이지 제목 |
| `<Body>` | 15px | 리스트 이름, 본문 |
| `<Caption>` | 13px muted | 서브 정보, 필터 |
| `<Micro>` | 11px muted | 배지, 날짜 세부 |
| `<SectionLabel>` | 12px semibold muted | 영문 섹션 라벨 |

### 종목별 색상 (Sport Tokens)
```css
--sport-road-run: 12 76% 61%;     /* 로드 러닝 */
--sport-ultra: 27 87% 67%;        /* 울트라마라톤 */
--sport-trail-run: 43 74% 66%;    /* 트레일 러닝 */
--sport-triathlon: 173 58% 39%;   /* 철인3종 */
--sport-cycling: 197 37% 24%;     /* 사이클 */
/* chart-1~5는 sport-* 참조 (하위호환) */
```

## 레이아웃 패턴

### 메인 레이아웃 (`(main)/layout.tsx`)
- 하단에 `BottomTabBar` 고정
- 콘텐츠 영역 `pb-20`으로 탭바 공간 확보
- 5개 탭: 홈, 대회, 프로젝트, 랭킹, 프로필

### 정보 레이아웃 (`(info)/layout.tsx`)
- 상단에 `BackHeader` (뒤로가기)
- 풀스크린 콘텐츠

### 로딩 패턴
```typescript
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

<Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
  <AsyncComponent />
</Suspense>
```

## 폼 패턴

### React Hook Form + Zod + shadcn Form
```typescript
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileEditSchema } from "@/lib/validations/member";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";

const form = useForm({
  resolver: zodResolver(profileEditSchema),
  defaultValues: { ... },
});

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField control={form.control} name="fieldName" render={({ field }) => (
      <FormItem>
        <FormLabel>라벨</FormLabel>
        <FormControl><Input {...field} /></FormControl>
      </FormItem>
    )} />
  </form>
</Form>
```

### Zod 스키마 위치
- `lib/validations/member.ts` — 프로필 편집 스키마
- `lib/validations/competition.ts` — 대회 등록/수정, 참가 신청 스키마

## 반응형 디자인
- 모바일 퍼스트 (기본 모바일, `md:` 이상에서 확장)
- 최대 너비: 대부분 화면에서 제한 없음 (모바일 앱 형태)
- safe-area-inset 대응 (PWA/노치 디바이스)
