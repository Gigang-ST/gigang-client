# 컴포넌트 컨벤션 가이드

## 디렉토리 구조

```
components/
  ui/          # shadcn/ui 공통 컴포넌트 (Button, Card, Dialog 등)
  auth/        # 인증 컴포넌트 (LoginForm, OnboardingForm)
  races/       # 대회 도메인 컴포넌트
  profile/     # 프로필 도메인 컴포넌트 (PersonalBestGrid, RaceRecordDialog, RaceHistoryDialog, PaceChart, RaceRecordSection)
  bottom-tab-bar.tsx        # 하단 네비게이션
  back-header.tsx           # 뒤로가기 헤더
  social-links.tsx          # 소셜 링크
  in-app-browser-gate.tsx   # 인앱브라우저 감지 → 외부 브라우저 유도 래퍼
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

### 기존 컴포넌트 목록
badge, button, card, dialog, form, input, label, loading-spinner, select, separator, skeleton

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

### 차트/종목별 색상
```css
--chart-1: 221 83% 53%;   /* 로드러닝 */
--chart-2: 160 60% 45%;   /* 트레일러닝 */
--chart-3: 30 80% 55%;    /* 철인3종 */
--chart-4: 280 65% 60%;   /* 사이클링 */
--chart-5: 340 75% 55%;   /* 울트라마라톤 */
```

## 레이아웃 패턴

### 메인 레이아웃 (`(main)/layout.tsx`)
- 하단에 `BottomTabBar` 고정
- 콘텐츠 영역 `pb-20`으로 탭바 공간 확보
- 4개 탭: 홈, 대회, 기록, 프로필

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

### React Hook Form + shadcn Form
```typescript
"use client";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";

const form = useForm({ defaultValues: { ... } });

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

## 반응형 디자인
- 모바일 퍼스트 (기본 모바일, `md:` 이상에서 확장)
- 최대 너비: 대부분 화면에서 제한 없음 (모바일 앱 형태)
- safe-area-inset 대응 (PWA/노치 디바이스)
