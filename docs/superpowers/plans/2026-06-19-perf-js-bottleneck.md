# 성능 개선 (JS 병목 제거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lighthouse Performance 점수를 49 → 74~78점으로 개선한다 (TBT·LCP 주도).

**Architecture:** (1) browserslist 현대화로 불필요한 레거시 폴리필 번들 제거 → (2) GTM을 lazyOnload로 전환해 초기 렌더 차단 제거 → (3) SchPostFormDialog dynamic import로 Zod가 홈 공유 청크에서 빠지도록 분리.

**Tech Stack:** Next.js 15 (Turbopack), pnpm, `@next/third-parties`, serwist, zod v4

## Global Constraints

- 패키지 매니저: `pnpm` (npm/yarn 금지)
- 브랜치: `perf/js-bottleneck-fix`
- 커밋 메시지: Conventional Commits (`perf:`, `chore:`)
- 날짜/시간: `dayjs` 사용, `new Date()` 직접 사용 금지
- 환경변수: `lib/env.ts` 에서만 import
- 기능 회귀 금지: 게시판 글쓰기, 일정 등록/수정, GA 이벤트 전송이 정상 동작해야 함

---

## Task 1: 번들 분석기 설치 및 현황 파악

현재 홈 JS 청크 구성을 시각적으로 확인한다. Phase 1~3 작업 전 베이스라인을 기록한다.

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json` (devDependency 추가)

**Interfaces:**
- Produces: `ANALYZE=true pnpm run build` 실행 시 `.next/analyze/` HTML 리포트 생성

- [ ] **Step 1: 번들 분석기 설치**

```bash
pnpm add -D @next/bundle-analyzer
```

- [ ] **Step 2: next.config.ts에 번들 분석기 조건부 적용**

```ts
// next.config.ts
import type { NextConfig } from "next";
import { execSync } from "child_process";
import bundleAnalyzer from "@next/bundle-analyzer";

function getGitVersion(): string {
  try {
    return execSync("git describe --tags --abbrev=0", { encoding: "utf-8" }).trim();
  } catch {
    return "v0.0.0";
  }
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: getGitVersion(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withBundleAnalyzer(nextConfig);
```

- [ ] **Step 3: 빌드 실행하여 현재 상태 확인**

```bash
ANALYZE=true pnpm run build
```

`.next/analyze/client.html` 파일이 생성되면 성공.  
브라우저로 열어 각 청크에 어떤 라이브러리가 얼마나 포함됐는지 확인 후 스크린샷 저장.

- [ ] **Step 4: 커밋**

```bash
git add next.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add @next/bundle-analyzer for perf investigation"
```

---

## Task 2: browserslist 현대화 (폴리필 제거)

`package.json`의 `browserslist`에서 `safari 15` → `safari >= 16` 으로 올린다.  
`Array.prototype.at`, `Object.hasOwn` 등 Safari 15.0~15.3 용 폴리필이 제거된다.

**배경:**
- 현재 설정: `["chrome 100", "safari 15", "firefox 100"]`
- `safari 15`는 15.0 기준 → `Array.prototype.at`(15.4+), `Object.hasOwn`(15.4+) 폴리필 포함
- `safari >= 16`으로 올리면 이 폴리필들이 번들에서 제거됨

**Files:**
- Modify: `package.json` (browserslist 섹션)

**Interfaces:**
- Produces: 빌드 후 `8d867abb3cdfb30c.js` 또는 유사 청크가 축소되거나 폴리필 목록 감소

- [ ] **Step 1: package.json browserslist 수정**

`package.json` 에서 `"browserslist"` 섹션을 찾아 다음과 같이 변경:

```json
"browserslist": [
  "chrome >= 90",
  "safari >= 16",
  "firefox >= 90",
  "edge >= 90",
  "samsung >= 15",
  "ios_saf >= 16"
]
```

> **왜 이 타겟인가:**  
> - Chrome 90 = 2021년 4월, Array.prototype.at(Chrome 92)보다 약간 낮지만 flat/flatMap/fromEntries는 커버  
> - Safari 16 = 2022년 9월, iOS 16 포함, at/hasOwn 모두 네이티브 지원  
> - 기강 앱 사용자는 스마트폰 위주라 iOS 16+ 비율이 높음

- [ ] **Step 2: 빌드 실행 및 폴리필 청크 크기 확인**

```bash
pnpm run build
```

빌드 완료 후 아래 명령으로 변화 확인:

```bash
ls -la .next/static/chunks/ | sort -k5 -rn | head -20
```

폴리필 청크(`8d867abb3cdfb30c.js`와 동일 내용의 새 해시 청크)가 줄었거나  
`legacy-javascript` 관련 청크가 사라졌으면 성공.

- [ ] **Step 3: 폴리필 제거 검증**

```bash
# 새 빌드의 가장 큰 청크를 대상으로 polyfill 키워드 검색
for f in .next/static/chunks/*.js; do
  count=$(grep -o "Array\.prototype\.at\|Object\.hasOwn\|Array\.prototype\.flat" "$f" 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    echo "$count hits in $(basename $f) ($(wc -c < $f) bytes)"
  fi
done
```

`hits`가 0이거나 이전보다 줄어들면 성공.

- [ ] **Step 4: 기능 동작 확인**

```bash
pnpm run dev
```

로컬에서 다음 확인:
- 홈 페이지 정상 로드
- 일정 다이얼로그 열림/닫힘 정상
- 브라우저 콘솔 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add package.json
git commit -m "perf: modernize browserslist to remove legacy polyfills (safari >= 16)"
```

---

## Task 3: Google Analytics lazyOnload 전환

`app/layout.tsx`에서 `@next/third-parties`의 `GoogleAnalytics` 컴포넌트를 제거하고  
Next.js 내장 `Script` 컴포넌트를 `strategy="lazyOnload"`로 직접 사용한다.

**배경:**
- `@next/third-parties`의 `GoogleAnalytics`는 `strategy` prop을 노출하지 않음
- 내부적으로 Next.js `Script`를 기본 전략(`afterInteractive`)으로 사용
- `afterInteractive`는 TTI 직후 로드 → LCP 완료 전에 GTM이 메인 스레드 점유
- `lazyOnload`는 브라우저 idle 시 로드 → 초기 렌더에 영향 0
- `lib/analytics.ts`는 `window.gtag`를 직접 호출하므로 컴포넌트 교체 후에도 동작함

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: GA 측정 ID `"G-H9LXJH97CZ"` (하드코딩, env.ts 미사용 — 기존 방식 유지)
- Produces: GTM 스크립트가 `lazyOnload`로 로드, `window.gtag` 동일하게 노출

- [ ] **Step 1: app/layout.tsx 수정**

`app/layout.tsx` 상단 import를 변경:

```tsx
// 제거
import { GoogleAnalytics } from "@next/third-parties/google";

// 추가
import Script from "next/script";
```

`<GoogleAnalytics gaId="G-H9LXJH97CZ" />` 를 다음으로 교체:

```tsx
<Script
  id="_ga-init"
  strategy="lazyOnload"
  dangerouslySetInnerHTML={{
    __html: `window['dataLayer']=window['dataLayer']||[];function gtag(){window['dataLayer'].push(arguments);}gtag('js',new Date());gtag('config','G-H9LXJH97CZ');`,
  }}
/>
<Script
  id="_ga"
  src="https://www.googletagmanager.com/gtag/js?id=G-H9LXJH97CZ"
  strategy="lazyOnload"
/>
```

- [ ] **Step 2: 빌드 확인**

```bash
pnpm run build
```

에러 없이 완료되면 성공.

- [ ] **Step 3: GA 이벤트 전송 동작 확인**

```bash
pnpm run dev
```

브라우저 DevTools Network 탭에서 확인:
- `gtag/js?id=G-H9LXJH97CZ` 요청이 발생함 (lazyOnload이므로 페이지 로드 완료 이후)
- 탭 클릭 시 `lib/analytics.ts`의 `tabClick` 이벤트가 Network에 `collect?v=2` 요청으로 나타남
- 콘솔에 `window.gtag is not a function` 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/layout.tsx
git commit -m "perf: defer Google Analytics to lazyOnload strategy"
```

---

## Task 4: SchPostFormDialog dynamic import (Zod 번들 분리)

`components/home/mini-calendar.tsx`에서 `SchPostFormDialog`를 static import → dynamic import로 변경한다.  
이로써 `zod` 및 `@hookform/resolvers/zod`가 홈 공유 청크에서 제거된다.

**배경:**
- 현재 import 체인: `mini-calendar.tsx` → `sch-post-form-dialog.tsx` → `zod` (정적 import)
- Next.js는 정적으로 import된 클라이언트 컴포넌트의 의존성을 공유 청크에 포함
- `SchPostFormDialog`는 다이얼로그 — 실제로 사용자가 버튼을 눌러야 열리므로 SSR 불필요
- dynamic import + `ssr: false`로 Zod가 홈 초기 번들에서 완전히 분리됨

**Files:**
- Modify: `components/home/mini-calendar.tsx` (line 32)

**Interfaces:**
- Consumes: `SchPostFormDialogProps` (타입은 분리 유지)
- Produces: 홈 초기 번들에서 Zod 청크 제거

- [ ] **Step 1: mini-calendar.tsx의 SchPostFormDialog import 수정**

`components/home/mini-calendar.tsx` line 32 수정:

```tsx
// 변경 전 (line 32)
import { SchPostFormDialog } from "@/components/schedule/sch-post-form-dialog";

// 변경 후
import dynamic from "next/dynamic";
import type { SchPostFormDialogProps } from "@/components/schedule/sch-post-form-dialog";

const SchPostFormDialog = dynamic<SchPostFormDialogProps>(
  () =>
    import("@/components/schedule/sch-post-form-dialog").then(
      (m) => m.SchPostFormDialog
    ),
  { ssr: false }
);
```

- [ ] **Step 2: SchPostFormDialogProps 타입이 export 되어있는지 확인**

```bash
grep -n "export.*SchPostFormDialogProps\|export type SchPostFormDialogProps" components/schedule/sch-post-form-dialog.tsx
```

없으면 `sch-post-form-dialog.tsx`에 타입 export 추가:

```tsx
// components/schedule/sch-post-form-dialog.tsx 에서
// 기존 type 선언을 export type으로 변경
export type SchPostFormDialogProps = {
  // ... 기존 내용 그대로
};
```

- [ ] **Step 3: 빌드 후 Zod 청크 분리 확인**

```bash
pnpm run build
```

빌드 후 확인:

```bash
# Zod가 홈 공유 청크에서 빠졌는지 확인
# 기존 0f560dba098d4ab1.js 와 동일한 내용의 청크가 줄었거나 사라져야 함
for f in .next/static/chunks/*.js; do
  count=$(grep -o '"zod"\|from "zod"\|__esModule.*zod' "$f" 2>/dev/null | wc -l)
  if [ "$count" -gt 10 ]; then
    echo "$count zod refs in $(basename $f) ($(wc -c < $f) bytes)"
  fi
done
```

이전에는 275KB 청크에 zod가 475회 등장했음. 분리 후 해당 청크가 없어지거나 줄어야 함.

- [ ] **Step 4: 다이얼로그 기능 동작 확인**

```bash
pnpm run dev
```

로컬에서:
- 홈 캘린더에서 일정 추가 버튼 클릭 → `SchPostFormDialog` 정상 오픈
- 일정 입력 후 저장 → 정상 저장
- 일정 수정 모드 → 기존 데이터 정상 표시
- 브라우저 Network 탭에서 다이얼로그 열릴 때 `sch-post-form-dialog` 청크 lazy 로드 확인

- [ ] **Step 5: 커밋**

```bash
git add components/home/mini-calendar.tsx components/schedule/sch-post-form-dialog.tsx
git commit -m "perf: dynamic import SchPostFormDialog to remove Zod from home bundle"
```

---

## Task 5: Lighthouse 재측정 및 결과 검증

3개 Phase 완료 후 GitHub Actions로 Lighthouse를 재측정하여 개선 효과를 수치로 확인한다.

**Files:**
- No code changes — 측정 및 결과 기록만

- [ ] **Step 1: GitHub Actions Lighthouse 재측정 트리거**

먼저 브랜치를 push한다:

```bash
git push origin perf/js-bottleneck-fix
```

그 다음 수동 트리거:

```bash
gh workflow run lighthouse-daily.yml --ref perf/js-bottleneck-fix
```

- [ ] **Step 2: 실행 완료 대기 및 아티팩트 다운로드**

```bash
# 실행 ID 확인
gh run list --workflow=lighthouse-daily.yml --limit 3

# 완료 후 다운로드 (run-id 교체)
gh run download <run-id> --name lighthouse-report -D /tmp/lh-after
```

- [ ] **Step 3: 결과 비교**

PowerShell에서 결과 파싱:

```powershell
$json = Get-Content C:\Users\user\AppData\Local\Temp\lh-after\lighthouse.report.json -Raw | ConvertFrom-Json
$cats = $json.categories
Write-Host "Performance: $([math]::Round($cats.performance.score * 100))"
Write-Host "LCP: $($json.audits.'largest-contentful-paint'.displayValue)"
Write-Host "TBT: $($json.audits.'total-blocking-time'.displayValue)"
Write-Host "FCP: $($json.audits.'first-contentful-paint'.displayValue)"
```

**목표 기준:**

| 지표 | 개선 전 | 목표 | 
|------|---------|------|
| Performance | 49 | **74 이상** |
| TBT | 1,810ms | **600ms 이하** |
| LCP | 5.6s | **3.5s 이하** |

- [ ] **Step 4: 결과 문서에 기록**

`.claude/docs/lh/performance-analysis.md` 하단에 "측정 이력" 섹션 추가:

```markdown
## 측정 이력

| 날짜 | 브랜치 | Performance | LCP | TBT | 비고 |
|------|--------|-------------|-----|-----|------|
| 2026-06-19 | dev (before) | 49 | 5.6s | 1,810ms | 베이스라인 |
| 2026-06-?? | perf/js-bottleneck-fix | ?? | ??s | ??ms | Phase 1+2+3 적용 후 |
```

- [ ] **Step 5: 목표치 달성 시 PR 생성**

```bash
# /pr 스킬 사용
```

목표치 미달 시 `.claude/docs/lh/improvement-plan.md` 의 미해결 항목 재검토.
