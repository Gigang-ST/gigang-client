# 기강 웹앱 성능 분석 보고서

> 측정일: 2026-06-19  
> 측정 URL: https://gigang.team/  
> 측정 환경: GitHub Actions (ubuntu-latest, headless Chrome)  
> Lighthouse 버전: 최신 (npm install -g lighthouse)

---

## 1. 종합 점수

| 카테고리 | 점수 | 평가 |
|----------|------|------|
| **Performance** | **49** | 🔴 나쁨 |
| Accessibility | 88 | 🟡 보통 |
| Best Practices | 93 | 🟢 좋음 |
| SEO | 92 | 🟢 좋음 |

---

## 2. 핵심 성능 지표 (Core Web Vitals)

| 지표 | 측정값 | 점수 | 기준 (Good) | 평가 |
|------|--------|------|-------------|------|
| **FCP** (First Contentful Paint) | 1.1s | 0.99 | ≤ 1.8s | 🟢 좋음 |
| **LCP** (Largest Contentful Paint) | 5.6s | 0.18 | ≤ 2.5s | 🔴 매우 나쁨 |
| **TBT** (Total Blocking Time) | 1,810ms | 0.09 | ≤ 200ms | 🔴 매우 나쁨 |
| **CLS** (Cumulative Layout Shift) | 0 | 1.00 | ≤ 0.1 | 🟢 완벽 |
| **SI** (Speed Index) | 4.7s | 0.68 | ≤ 3.4s | 🟡 보통 |
| **TTI** (Time to Interactive) | 5.8s | 0.67 | ≤ 3.8s | 🟡 보통 |
| **TTFB** (서버 응답) | 0ms | 1.00 | ≤ 800ms | 🟢 완벽 |

### Lighthouse 점수 계산 가중치

```
Performance = FCP(10%) + SI(10%) + LCP(25%) + TBT(30%) + CLS(25%)
현재: 9.9 + 6.8 + 4.5 + 2.7 + 25 = 48.9 ≈ 49
```

---

## 3. 병목 원인 분석

### 3-1. LCP 5.6s 원인 분해

LCP 요소: `<p class="font-sans text-[13px]...">NO TIME TO BE WEAK</p>`  
(텍스트인데도 5.6초 — 이미지가 아니라 JS 블로킹 문제)

| 단계 | 시간 | 비중 | 의미 |
|------|------|------|------|
| TTFB | 827ms | 15% | 서버가 HTML을 내려주는 시간 → 정상 |
| Load Delay | 0ms | 0% | 리소스 다운로드 대기 → 없음 |
| Load Time | 0ms | 0% | 리소스 다운로드 시간 → 없음 |
| **Render Delay** | **4,753ms** | **85%** | **JS가 메인 스레드를 막아 렌더 지연** |

> **결론:** 서버/네트워크는 문제 없음. JS 실행이 React 하이드레이션을 막아서 텍스트조차 늦게 렌더됨.

---

### 3-2. TBT 1,810ms 원인 — 긴 메인 스레드 작업 목록

TBT = 50ms 초과 작업의 초과분 합계 (50ms 이하는 정상 범위)

| 순위 | 소요시간 | 초과분 (TBT 기여) | 원인 파일 |
|------|----------|------------------|-----------|
| 1 | 386ms | 336ms | `8d867abb3cdfb30c.js` ← **레거시 폴리필** |
| 2 | 367ms | 317ms | Unattributable (React 하이드레이션 의심) |
| 3 | 311ms | 261ms | `8d867abb3cdfb30c.js` ← **레거시 폴리필** |
| 4 | 275ms | 225ms | `googletagmanager.com/gtag/js` ← **GTM** |
| 5 | 214ms | 164ms | `gigang.team/` (홈 JS) |
| 6 | 209ms | 159ms | `8d867abb3cdfb30c.js` ← **레거시 폴리필** |
| 7 | 169ms | 119ms | `8d867abb3cdfb30c.js` ← **레거시 폴리필** |
| 8 | 159ms | 109ms | `googletagmanager.com/gtag/js` ← **GTM** |
| 9 | 143ms | 93ms | `8d867abb3cdfb30c.js` ← **레거시 폴리필** |
| 10 | 114ms | 64ms | `turbopack-*.js` |
| **합계** | | **~1,847ms** | |

---

### 3-3. 홈페이지 로드 JS 청크 전체 목록

```
총 요청: 38개 | 총 전송 크기: 688KB
```

| 청크 파일 | 크기 | 실행시간 | 정체 |
|-----------|------|----------|------|
| `8d867abb3cdfb30c.js` | 224KB | **1,491ms** | 레거시 폴리필 묶음 |
| `0f560dba098d4ab1.js` | 275KB | - | **Zod v4** 전체 번들 |
| `709db45257683efe.js` | 212KB | - | **Supabase** 클라이언트 |
| `44aca9cb90e1d565.js` | 125KB | - | (미사용 35KB, 100% 낭비) |
| `a6dad97d9634a72d.js` | 113KB | - | Next.js 런타임 |
| `googletagmanager` | 159KB | **485ms** | Google Analytics |

---

## 4. 근본 원인: 레거시 폴리필

### 무엇인가

`8d867abb3cdfb30c.js` (224KB) 는 구형 브라우저를 위해 자동 삽입된 JavaScript 폴리필 모음입니다.

| 폴리필 | 지원 시작 (Chrome) | 현재 필요성 |
|--------|-------------------|------------|
| `Array.prototype.at` | Chrome 92 (2021.07) | ❌ 불필요 |
| `Array.prototype.flat` | Chrome 69 (2018.10) | ❌ 불필요 |
| `Array.prototype.flatMap` | Chrome 69 (2018.10) | ❌ 불필요 |
| `Object.fromEntries` | Chrome 73 (2019.03) | ❌ 불필요 |
| `Object.hasOwn` | Chrome 93 (2021.08) | ❌ 불필요 |
| `String.prototype.trimEnd` | Chrome 66 (2018.04) | ❌ 불필요 |
| `String.prototype.trimStart` | Chrome 66 (2018.04) | ❌ 불필요 |

### 왜 생겼나

프로젝트의 `browserslist` 타겟이 너무 넓게 설정되어 있어서 Next.js/Babel/SWC가 오래된 브라우저도 지원하기 위해 폴리필을 자동으로 번들에 포함시킴.

기강 앱은 스마트폰 중심 서비스로 사용자 대부분이 최신 iOS/Android 앱을 쓰고 있어 이 폴리필들은 실제로 전혀 쓰이지 않음.

---

## 5. 보조 원인들

### 5-1. Google Tag Manager (GTM) — 485ms 블로킹
- 크기: 159KB (이 중 64KB 미사용)
- 현재 `@next/third-parties/google`의 `GoogleAnalytics` 기본값은 `afterInteractive`
- GTM 자체의 `@babel/plugin-transform-regenerator` 폴리필도 포함되어 있음
- 초기 렌더 이후로 미루는 전략(`lazyOnload`) 적용하면 TBT에서 ~334ms 제거 가능

### 5-2. Zod v4 번들 (275KB) — 홈페이지에 로드됨
- Zod v4는 v3 대비 번들 크기가 큼
- 홈페이지에서 실제로 폼 검증이 필요 없는데 Zod 전체가 로드되는 이유 파악 필요
- 클라이언트 컴포넌트의 Zod 스키마 import가 공유 청크를 통해 홈에 유입된 것으로 추정

### 5-3. 미사용 JS 240KB
- `44aca9cb90e1d565.js`: 35KB 전체가 미사용
- GTM: 64KB 미사용
- Supabase 청크: 45KB 미사용

### 5-4. Service Worker 프리캐시 8.47MB
- 현재 serwist가 171개 URL, 총 8.47MB를 프리캐시
- 최초 방문 시 백그라운드에서 8.47MB 다운로드 → 모바일 데이터 사용량 문제
- JS 청크 전체를 프리캐시하고 있을 가능성 높음 (선별적 캐싱 필요)

---

## 6. "Supabase 리전 변경" 효과 검토

> **결론: 효과 없음**

TTFB(서버 응답)가 이미 **0ms**로 측정됨. Supabase Japan 리전이 현재 성능에 전혀 영향을 주지 않고 있음. 리전을 Korea로 바꿔도 Performance 점수는 변동 없음.

---

## 7. 개선 계획 및 예상 효과

### Phase 1: browserslist 현대화 (폴리필 제거)

**작업:** `.browserslistrc` 생성 또는 `package.json`의 `browserslist` 수정

```
Chrome >= 90
Safari >= 16
Firefox >= 90
Edge >= 90
```

**예상 효과:**
- TBT: 1,810ms → **~840ms** (968ms 감소)
- LCP: 5.6s → **~3.5s**
- Performance: 49 → **~60~65점**

### Phase 2: GTM lazyOnload 전환

**작업:** `app/layout.tsx`에서 `GoogleAnalytics` 로드 전략 변경

**예상 효과:**
- TBT: 840ms → **~510ms** (334ms 감소)
- Performance: 65 → **~68~72점**

### Phase 3: Zod / Supabase 번들 분리

**작업:** 홈 번들에 포함된 Zod/Supabase 청크 원인 파악 및 코드 스플리팅

**예상 효과:**
- 미사용 JS 100KB+ 감소
- Performance: 72 → **~74~78점**

### 현실적 최종 목표

| 시나리오 | 예상 점수 |
|----------|----------|
| 현재 | 49 |
| Phase 1 완료 | 60~65 |
| Phase 1+2 완료 | 68~72 |
| Phase 1+2+3 완료 | **74~78** |
| 85+ 달성 조건 | TBT ≤ 200ms + LCP ≤ 2.5s (추가 최적화 필요) |

---

## 8. 측정 방법

### GitHub Actions 자동 측정 (매일 09:00 KST)

```yaml
# .github/workflows/lighthouse-daily.yml
lighthouse https://gigang.team/
  --output html --output json
  --output-path ./lighthouse
  --chrome-flags="--headless=new --no-sandbox"
```

아티팩트: `lighthouse-report` (HTML + JSON, 30일 보존)

### 수동 재측정 방법

```bash
gh workflow run lighthouse-daily.yml --ref dev
gh run download <run-id> --name lighthouse-report -D /tmp/lh
```

---

## 9. 참고: 측정 시 주의사항

- Lighthouse는 **네트워크 쓰로틀링 4G**, **CPU 4x 슬로다운** 환경에서 시뮬레이션
- 실제 한국 사용자 체감은 이보다 빠를 수 있음 (특히 WiFi/5G 환경)
- GitHub Actions 서버 위치(미국)에서 `gigang.team` 서버(Vercel)까지 레이턴시가 포함됨
- 매 측정마다 ±5~10점 편차 있음 (3회 평균 권장)
