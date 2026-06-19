# 기강 웹앱 성능 개선 계획

> 작성일: 2026-06-19  
> 기준 분석: `performance-analysis.md`  
> 작업 브랜치: `perf/js-bottleneck-fix`  
> 현재 Performance 점수: **49점**  
> 목표 Performance 점수: **74~78점**

---

## 작업 진행 기록

### ✅ Task 1 — 번들 분석기 설치 (2026-06-19 완료)

**변경 파일:** `next.config.ts`, `package.json`

`@next/bundle-analyzer`를 devDependency로 추가하고 `next.config.ts`에 조건부 래핑 적용.
`ANALYZE=true pnpm run build` 실행 시 `.next/analyze/` HTML 리포트 생성.

Turbopack 환경에서 `.next/analyze/client.html`이 생성되지 않아 `pnpm exec next experimental-analyze`로 대체 분석.

**발견된 핵심 사실 (계획에 없던 것):**
`post-form.tsx`의 `import "@uiw/react-md-editor/markdown-editor.css"` 정적 CSS import 한 줄이
Turbopack 모듈 그래프 분석을 통해 **refractor 876KB**를 홈 초기 번들에 끌어들이고 있었음.
(기존 분석에서 `8d867abb`로 식별했던 "폴리필 덩어리"가 실제로는 refractor였음)

```
청크 크기 before: 876KB (f79a3ac5 = refractor 언어 문법 토큰 집합)
청크 크기 after:  362KB (refractor 완전 제거)
```

---

### ✅ Task 2 — refractor 홈 번들 제거 (2026-06-19 완료)

**변경 파일:**
- `components/board/md-editor-loader.tsx` (신규 생성)
- `components/board/post-form.tsx` (dynamic import 대상 변경)

**원인:** `post-form.tsx`에 정적으로 import된 CSS 파일이 Turbopack 모듈 그래프를 통해 refractor 전체를 홈 공유 청크에 포함시킴.

**해결:** CSS import를 `md-editor-loader.tsx`라는 래퍼 파일에 격리하고, 이 파일 전체를 `dynamic(() => import(...), { ssr: false })`로만 로드.

```tsx
// md-editor-loader.tsx
"use client";
import "@uiw/react-md-editor/markdown-editor.css";
export { default } from "@uiw/react-md-editor/nohighlight";

// post-form.tsx
const MDEditor = dynamic(
  () => import("@/components/board/md-editor-loader"),
  { ssr: false }
);
```

**실제 효과:**

| 지표 | 변경 전 | 변경 후 |
|------|--------|--------|
| 홈 최대 청크 크기 | 876KB | 362KB |
| refractor 홈 존재 여부 | ✅ 포함 | ❌ 제거 |
| 예상 TBT 개선 | — | **-968ms** |
| 예상 LCP 개선 | — | **-2.1s** |

**부가 효과:** 글쓰기 진입 시 에디터가 ~0.5~1초 늦게 나타남 (관리자 전용, 허용 가능한 트레이드오프).

---

### ✅ Task 3 — browserslist 현대화 (2026-06-19 완료)

**변경 파일:** `package.json`

```json
// 변경 전
"browserslist": ["chrome 100", "safari 15", "firefox 100"]

// 변경 후
"browserslist": ["chrome >= 90", "safari >= 16", "firefox >= 90", "edge >= 90", "samsung >= 15", "ios_saf >= 16"]
```

**실제 효과 (예상과 다름):**

빌드 후 확인 결과, 기존에 "224KB 폴리필 청크(`8d867abb`)"로 식별했던 것이 실은 **refractor**였고 이미 Task 2에서 제거됨.
남아있는 폴리필 코드(`Array.prototype.at||(Array.prototype.at=function...)`)는 Next.js/SWC가 주입한 게 아니라 **서드파티 라이브러리 내장 런타임 가드** 형태 — browserslist로 제거 불가.

| 지표 | 변경 전 | 변경 후 |
|------|--------|--------|
| 최대 청크 크기 | 362KB | 354KB |
| 유효 폴리필 제거 크기 | — | **~8KB** (미미) |
| 예상 TBT 개선 | — | 미미 |

**의의:** 향후 새 라이브러리 추가 시 Next.js가 자동 폴리필을 넣지 않도록 방어 설정 역할. 현재 번들에 대한 직접 효과는 거의 없음.

---

## 전체 개요

```
[현재 49점]
    │
    ▼ Task 2: refractor dynamic import (완료) → TBT -968ms, LCP -2.1s 예상
[60~65점 예상]
    │
    ▼ Task 3: browserslist 현대화 (완료) → 효과 미미 (예상 밖)
[변화 없음]
    │
    ▼ Task 4: GTM lazyOnload 전환 (진행 예정)
[+7~8점]
    │
    ▼ Task 5: Zod/Supabase 번들 분리 (진행 예정)
[74~78점]
```

성능 점수에 가장 큰 영향을 주는 두 지표는 **TBT(30%)** 와 **LCP(25%)** 입니다.  
세 Phase 모두 이 두 지표를 직접 개선합니다.

---

## Phase 1 — browserslist 현대화 (폴리필 제거)

### 원인

Next.js는 빌드 시 `browserslist` 설정을 읽어 어떤 브라우저를 지원할지 결정합니다.  
설정이 없거나 넓게 설정되어 있으면 SWC/Babel이 **구형 브라우저를 위한 폴리필을 자동으로 번들에 포함**합니다.

현재 프로젝트에는 `browserslist` 설정이 없어서 Next.js 기본값(매우 넓은 범위)이 적용되고 있습니다.  
그 결과 `8d867abb3cdfb30c.js` (224KB) 라는 폴리필 덩어리가 홈페이지에 항상 로드됩니다.

**포함된 폴리필과 불필요한 이유:**

| 폴리필 | Chrome 지원 시작 | 불필요한 이유 |
|--------|-----------------|--------------|
| `Array.prototype.at` | Chrome 92 (2021.07) | 4년 전부터 모든 브라우저 기본 지원 |
| `Array.prototype.flat` | Chrome 69 (2018.10) | 7년 전부터 기본 지원 |
| `Array.prototype.flatMap` | Chrome 69 (2018.10) | 7년 전부터 기본 지원 |
| `Object.fromEntries` | Chrome 73 (2019.03) | 6년 전부터 기본 지원 |
| `Object.hasOwn` | Chrome 93 (2021.08) | 4년 전부터 기본 지원 |
| `String.prototype.trimEnd` | Chrome 66 (2018.04) | 7년 전부터 기본 지원 |
| `String.prototype.trimStart` | Chrome 66 (2018.04) | 7년 전부터 기본 지원 |

기강 앱 사용자는 스마트폰 위주이며, iOS/Android 최신 앱에서 접근합니다.  
2021년 이전 브라우저를 쓰는 사용자는 사실상 없습니다.

**메인 스레드 블로킹 흐름:**

```
페이지 로드
    │
    ├─ 8d867abb3cdfb30c.js (224KB 폴리필) 다운로드 + 실행
    │       386ms 작업
    │       311ms 작업   ← 합계 1,491ms 동안 메인 스레드 점유
    │       209ms 작업
    │       169ms 작업
    │       143ms 작업
    │
    ├─ React 하이드레이션 시작 (폴리필 끝나야 가능)
    │
    └─ "NO TIME TO BE WEAK" 텍스트 렌더 → LCP 완료 (5.6s)
```

### 개선 방안

프로젝트 루트에 `.browserslistrc` 파일을 생성합니다.

**타겟 브라우저 기준:**
- Chrome / Edge 90+ (2021년 4월 이후)
- Safari 16+ (2022년 9월 이후, iOS 16 포함)
- Firefox 90+ (2021년 7월 이후)
- Samsung Internet 15+ (2021년 이후)

**작업 파일:**
- 신규 생성: `/.browserslistrc`

```
# 기강 앱 지원 브라우저 타겟
# 2021년 이후 출시된 모던 브라우저만 지원
# 레거시 폴리필 불필요

[production]
Chrome >= 90
Edge >= 90
Safari >= 16
Firefox >= 90
Samsung >= 15
iOS >= 16

[development]
last 1 Chrome version
last 1 Firefox version
last 1 Safari version
```

**동작 원리:**  
Next.js 빌드 시 SWC 컴파일러가 `.browserslistrc`를 읽고, 위 브라우저들이 이미 네이티브로 지원하는 기능에 대해서는 폴리필을 번들에 포함시키지 않습니다.

### 기대 효과

| 지표 | 개선 전 | 개선 후 | 변화 |
|------|---------|---------|------|
| TBT | 1,810ms | ~840ms | **-968ms** |
| LCP | 5.6s | ~3.5s | **-2.1s** |
| JS 번들 크기 | 688KB | ~464KB | **-224KB** |
| Performance 점수 | 49 | **60~65** | **+13~16점** |

**TBT 개선 상세:**

```
현재 TBT = 1,810ms

제거되는 기여분:
  8d867abb 386ms 작업 → 336ms 기여 제거
  8d867abb 311ms 작업 → 261ms 기여 제거
  8d867abb 209ms 작업 → 159ms 기여 제거
  8d867abb 169ms 작업 → 119ms 기여 제거
  8d867abb 143ms 작업 → 93ms 기여 제거
  ─────────────────────────────────────
  합계: -968ms

Phase 1 후 TBT ≈ 842ms
```

---

## Phase 2 — GTM lazyOnload 전환

### 원인

Google Analytics(`GoogleAnalytics` from `@next/third-parties/google`)가 `app/layout.tsx`에 등록되어 있습니다.

```tsx
// app/layout.tsx (현재)
<GoogleAnalytics gaId="G-H9LXJH97CZ" />
```

`@next/third-parties`의 `GoogleAnalytics`는 기본 전략이 `afterInteractive`입니다.  
이는 페이지가 인터랙티브해진 직후 GTM 스크립트를 로드하는 전략인데,  
현재 페이지는 폴리필 + 기타 JS 때문에 인터랙티브해지는 데 5.8초가 걸립니다.  
그 시점에 GTM이 로드되면서 메인 스레드를 **275ms + 159ms = 434ms** 추가로 점유합니다.

**문제의 핵심:**  
GTM은 사용자 행동 추적용이라 초기 렌더에 전혀 필요하지 않습니다.  
하지만 현재는 인터랙티브 직후 즉시 로드되어 LCP 완료 전후로 메인 스레드를 차지합니다.

```
[5.8s 시점] 페이지 인터랙티브 됨
    │
    ├─ GTM 스크립트 로드 시작 (159KB)
    │       275ms 작업  ← TBT 225ms 기여
    │       159ms 작업  ← TBT 109ms 기여
    │
    └─ 사용자가 버튼을 눌러도 반응 없는 구간 발생
```

### 개선 방안

`GoogleAnalytics`에 `strategy="lazyOnload"` prop을 추가합니다.

**`afterInteractive` vs `lazyOnload` 차이:**

| 전략 | 로드 시점 | 특성 |
|------|-----------|------|
| `afterInteractive` (현재) | 페이지 인터랙티브 직후 | LCP/TTI와 겹칠 수 있음 |
| `lazyOnload` (변경 후) | 브라우저 idle 상태일 때 | 초기 성능에 영향 없음 |

`lazyOnload`는 브라우저의 `requestIdleCallback`을 활용해 완전히 한가한 시점에 로드합니다.  
분석 데이터가 1~2초 늦게 수집될 수 있지만 성능 영향은 0에 가깝습니다.

**작업 파일:** `app/layout.tsx`

```tsx
// 변경 전
<GoogleAnalytics gaId="G-H9LXJH97CZ" />

// 변경 후
<GoogleAnalytics gaId="G-H9LXJH97CZ" />
```

> **참고:** `@next/third-parties`의 `GoogleAnalytics`는 내부적으로 `strategy` prop을 받지 않습니다.  
> 대신 Next.js `Script` 컴포넌트를 직접 사용하거나, `@next/third-parties`의 실제 구현을 확인 후 적용합니다.  
> 구현 시 실제 API에 맞게 조정 예정.

### 기대 효과

| 지표 | Phase 1 후 | Phase 2 후 | 변화 |
|------|-----------|-----------|------|
| TBT | ~840ms | **~510ms** | -334ms |
| Performance 점수 | 60~65 | **68~72** | +7~8점 |

**TBT 개선 상세:**

```
Phase 1 후 TBT ≈ 842ms

GTM 기여분 제거:
  GTM 275ms 작업 → 225ms 기여 제거
  GTM 159ms 작업 → 109ms 기여 제거
  ────────────────────────────────
  합계: -334ms

Phase 2 후 TBT ≈ 508ms
```

---

## Phase 3 — Zod / Supabase 번들 분리

### 원인

홈페이지(https://gigang.team/) 초기 로드 시 두 개의 무거운 라이브러리가 함께 로드됩니다.

| 청크 | 크기 | 정체 | 홈에서 실제 필요한가 |
|------|------|------|---------------------|
| `0f560dba098d4ab1.js` | 275KB | Zod v4 전체 | ❌ 홈에 폼 없음 |
| `709db45257683efe.js` | 212KB | Supabase 클라이언트 | △ 일부만 필요 |

**왜 홈에 Zod가 로드될까?**

Next.js는 여러 페이지에서 공통으로 사용하는 모듈을 `shared chunk`로 묶습니다.  
Zod 스키마를 import하는 클라이언트 컴포넌트가 하나라도 있으면 Zod 전체가 공유 청크에 들어갑니다.  
이 공유 청크는 Zod가 필요 없는 홈페이지에도 로드됩니다.

**예상 원인 경로:**

```
app/(main)/page.tsx (홈)
    └─ components/home/mini-calendar.tsx  (클라이언트 컴포넌트)
        └─ components/schedule/sch-post-form-dialog.tsx
            └─ lib/validations/schedule.ts (Zod 스키마 import)
                └─ import { z } from "zod"  ← 여기서 Zod가 공유 청크에 편입
```

`sch-post-form-dialog.tsx`가 Dialog 안에서만 열리더라도, 파일 자체가 `import`되는 순간 Zod가 번들에 포함됩니다.

**44aca9cb90e1d565.js 100% 낭비 문제:**  
이 청크(125KB 중 35KB)는 홈에서 전혀 실행되지 않는 코드입니다.  
어떤 컴포넌트가 이 청크를 유발하는지 빌드 후 별도 분석 필요합니다.

### 개선 방안

#### 방안 A: `sch-post-form-dialog` dynamic import 적용

`mini-calendar.tsx`에서 `SchPostFormDialog`를 동적 임포트로 변경합니다.

```tsx
// components/home/mini-calendar.tsx

// 변경 전
import { SchPostFormDialog } from "@/components/schedule/sch-post-form-dialog";

// 변경 후
import dynamic from "next/dynamic";
const SchPostFormDialog = dynamic(
  () => import("@/components/schedule/sch-post-form-dialog").then(m => m.SchPostFormDialog),
  { ssr: false }
);
```

다이얼로그는 클릭 시에만 열리므로 SSR 불필요. 초기 번들에서 Zod 로딩 제거 가능.

#### 방안 B: Zod 스키마를 서버 전용으로 분리

클라이언트 컴포넌트에서 직접 Zod 스키마를 import하는 대신,  
서버 액션에서만 Zod 검증을 수행하고 클라이언트는 타입 추론만 사용합니다.

```tsx
// 현재 패턴 (클라이언트에서 Zod import)
import { createSchPostSchema } from "@/lib/validations/schedule";
const form = useForm({ resolver: zodResolver(createSchPostSchema) });

// 개선 패턴 (서버에서만 검증, 클라이언트는 타입만)
import type { CreateSchPostInput } from "@/lib/validations/schedule";
const form = useForm<CreateSchPostInput>({ /* 클라이언트 검증 생략 또는 경량 대체 */ });
```

> **선택:** 방안 A가 변경 범위가 작고 즉각적 효과가 명확하므로 Phase 3에서는 방안 A를 우선 적용합니다.

#### 방안 C: 번들 분석기 도입 (원인 확인용)

`@next/bundle-analyzer` 설치 후 시각적으로 어떤 모듈이 어떤 청크에 들어갔는지 확인합니다.

```bash
pnpm add -D @next/bundle-analyzer
ANALYZE=true pnpm run build
```

`next.config.ts`에 번들 분석기를 조건부로 추가합니다.

### 기대 효과

| 지표 | Phase 2 후 | Phase 3 후 | 변화 |
|------|-----------|-----------|------|
| 초기 JS 번들 크기 | ~464KB | **~200~250KB** | -200KB+ |
| 미사용 JS | 240KB | **~80KB** | -160KB |
| Performance 점수 | 68~72 | **74~78** | +5~6점 |

**번들 크기 개선 예상:**
```
현재 홈 초기 JS: 688KB
  - Phase 1: -224KB (폴리필 제거)
  - Phase 3: -275KB (Zod 공유청크에서 분리)
            -35KB (44aca9cb 미사용 청크)
예상 최종: ~154KB+α (Supabase 등 나머지)
```

---

## 성능 점수 최종 예측

```
Lighthouse 가중치: FCP 10% / SI 10% / LCP 25% / TBT 30% / CLS 25%

┌─────────────────┬───────┬───────────┬───────────┬───────────┐
│ 지표             │ 현재  │ Phase 1   │ Phase 1+2 │ Phase 1+3 │
├─────────────────┼───────┼───────────┼───────────┼───────────┤
│ FCP             │ 1.1s  │ 1.1s      │ 1.1s      │ 1.1s      │
│ LCP             │ 5.6s  │ ~3.5s     │ ~3.0s     │ ~2.8s     │
│ TBT             │1,810ms│ ~840ms    │ ~510ms    │ ~400ms    │
│ CLS             │ 0     │ 0         │ 0         │ 0         │
│ SI              │ 4.7s  │ ~3.5s     │ ~3.0s     │ ~2.8s     │
├─────────────────┼───────┼───────────┼───────────┼───────────┤
│ Performance     │  49   │  60~65    │  68~72    │  74~78    │
└─────────────────┴───────┴───────────┴───────────┴───────────┘
```

**85점 이상 달성 조건 (현재 범위 밖):**
- TBT ≤ 200ms 달성 필요 → Unattributable 367ms 작업(React 하이드레이션) 해결 필요
- LCP ≤ 2.5s 달성 필요 → 홈 클라이언트 컴포넌트 최소화 또는 PPR 심화 적용 필요

---

## 검증 방법

각 Phase 완료 후 Lighthouse를 재측정하여 효과를 확인합니다.

```bash
# 수동 측정 트리거
gh workflow run lighthouse-daily.yml --ref perf/js-bottleneck-fix

# 아티팩트 다운로드
gh run download <run-id> --name lighthouse-report -D /tmp/lh-check
```

**체크리스트:**
- [ ] Phase 1 완료 후: TBT 1,810ms → 840ms 이하 확인
- [ ] Phase 2 완료 후: TBT 840ms → 510ms 이하 확인
- [ ] Phase 3 완료 후: 미사용 JS 240KB → 80KB 이하 확인
- [ ] 전체 완료 후: Performance 점수 74점 이상 확인
- [ ] 기능 회귀 없음 확인 (게시판 작성, 일정 등록, 프로필 수정)
