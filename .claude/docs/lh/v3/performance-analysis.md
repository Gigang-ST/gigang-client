# 기강 웹앱 성능 분석 보고서 v3

> 측정일: 2026-06-20  
> 측정 URL: https://gigang.team/  
> 측정 환경: GitHub Actions (ubuntu-latest, headless Chrome)  
> Lighthouse 버전: 12.x (npm install -g lighthouse@12)  
> 기준 비교: v2 (2026-06-19, 83점) → PR #335 적용 후 재측정  
> Actions Run ID: 27867811732  
> 빌드 변경사항: `next build` → `next build --webpack` (Webpack 고정)

---

## 1. 종합 점수

| 카테고리 | v2 | v3 | 변화 |
|----------|----|----|------|
| **Performance** | **83** 🟢 | **76** 🟡 | **-7점** |
| Accessibility | 88 🟡 | 88 🟡 | ± 0 |
| Best Practices | 93 🟢 | 96 🟢 | +3 |
| SEO | 92 🟢 | 92 🟢 | ± 0 |

> **맥락:** v3은 "올바른 Webpack 베이스라인" 확립이 목적. v2(83점)는 `@serwist` 패키지가 Webpack을 암묵적으로 강제하던 시점 측정. PR #330에서 serwist 제거 후 Turbopack으로 전환돼 61점으로 회귀했고, PR #335에서 `--webpack` 플래그로 명시 고정 후 재측정.

---

## 2. 핵심 성능 지표 (Core Web Vitals)

| 지표 | v2 | v3 | 변화 | 기준 (Good) | 평가 |
|------|----|----|------|-------------|------|
| **FCP** (First Contentful Paint) | 1.1s | **1.2s** | +0.1s | ≤ 1.8s | 🟢 좋음 |
| **LCP** (Largest Contentful Paint) | 3.6s | **2.4s** | **-1.2s** | ≤ 2.5s | 🟢 **달성** |
| **TBT** (Total Blocking Time) | 150ms | **910ms** | **+760ms** | ≤ 200ms | 🔴 악화 |
| **CLS** (Cumulative Layout Shift) | 0 | **0** | ± 0 | ≤ 0.1 | 🟢 완벽 |
| **SI** (Speed Index) | 6.4s | **3.0s** | **-3.4s** | ≤ 3.4s | 🟢 **달성** |
| **TTI** (Time to Interactive) | 4.9s | **5.1s** | +0.2s | ≤ 3.8s | 🟡 보통 |
| **TTFB** (서버 응답) | 20ms | **~0ms** | - | ≤ 800ms | 🟢 완벽 |

### Lighthouse 점수 계산 가중치

```text
Performance = FCP(10%) + SI(10%) + LCP(25%) + TBT(30%) + CLS(25%)

v2: 9.9 + 4.1 + 15.3 + 28.5 + 25.0 = 82.8 ≈ 83
v3: 9.9 + 9.4 + 22.8 + 9.3 + 25.0 = 76.4 ≈ 76
```

> **TBT가 핵심 병목:** TBT 910ms → 점수 0.31(9.3점). v2는 150ms → 0.95(28.5점). TBT 단독으로 -19점 차이 발생.  
> **SI·LCP는 개선:** SI 6.4s→3.0s, LCP 3.6s→2.4s로 v2 대비 대폭 향상.

---

## 3. TBT 분해: v3 롱 태스크 목록

v3 측정에서 14개의 롱 태스크(50ms 초과) 감지:

| 소요시간 | 시작 시점 | 기여 TBT |
|----------|-----------|----------|
| 270ms | 1,023ms | 220ms |
| 256ms | 1,293ms | 206ms |
| 175ms | 2,597ms | 125ms |
| 164ms | 1,793ms | 114ms |
| 149ms | 4,742ms | 99ms |
| 132ms | 797ms | 82ms |
| 127ms | 5,004ms | 77ms |
| 126ms | 1,549ms | 76ms |
| 111ms | 4,893ms | 61ms |
| 94ms | 929ms | 44ms |
| 88ms | 1,997ms | 38ms |
| 70ms | 2,108ms | 20ms |
| 64ms | 1,729ms | 14ms |
| 54ms | 1,675ms | 4ms |
| **합계** | | **≈ 910ms** |

### 메인 스레드 작업 분해 (3.3s 총합)

| 작업 유형 | 시간 |
|-----------|------|
| Script Evaluation | 1,396ms |
| Other | 858ms |
| Style & Layout | 658ms |
| Script Parsing & Compilation | 214ms |
| Parse HTML & CSS | 128ms |
| Rendering | 23ms |

### 주요 JS 파일 실행 시간

| 파일 | 실행시간 |
|------|----------|
| `4476-a05d438634550f2d.js` | 613ms |
| `gtag/js` (GA) | 274ms |
| `webpack-00912745c83dc2aa.js` | 261ms |
| `3872-111009cccff45ad8.js` | 149ms |
| `dab2510c-93e18f97f91dcf35.js` | 66ms |

---

## 4. JS 번들 분석

### 총 JS 전송량

| | v2 (추정) | v3 |
|--|-----------|-----|
| JS 파일 수 | ~23개 | **34개** |
| JS 총 전송 크기 | - | **561KB** |

### 주요 청크 (50KB 이상)

| 청크 파일 | 전송 크기 | 미사용 |
|-----------|-----------|--------|
| `gtag/js` (GA) | 159KB | 65KB |
| `dab2510c-...js` | 62KB | 22KB |
| `6375-6fe6...js` | 55KB | 44KB |
| `4476-a054...js` | 51KB | 24KB |

### 미사용 JS (총 절감 가능: 204KB / 450ms)

| 파일 | 미사용 | 총 크기 |
|------|--------|---------|
| `gtag/js` | 65KB | 159KB |
| `6375-6fe6...js` | 44KB | 55KB |
| `3872-1110...js` | 27KB | 40KB |
| `4476-a054...js` | 24KB | 51KB |
| `4726-ec8b...js` | 22KB | 29KB |
| `dab2510c-...js` | 22KB | 62KB |

> `webpack-00912745c83dc2aa.js` 존재 → Webpack 빌드 정상 확인 ✅

---

## 5. v1 → v2 → v3 추이 비교

| 지표 | v1 | v2 | v3 | v2→v3 |
|------|----|----|-----|-------|
| **Performance** | 49 | 83 | **76** | -7 |
| FCP | 1.1s | 1.1s | 1.2s | +0.1s |
| LCP | 5.6s | 3.6s | **2.4s** ✅ | **-1.2s** |
| TBT | 1,810ms | 150ms | **910ms** ⚠️ | +760ms |
| CLS | 0 | 0 | 0 | ± 0 |
| SI | 4.7s | 6.4s | **3.0s** ✅ | **-3.4s** |
| TTI | 5.8s | 4.9s | 5.1s | +0.2s |

---

## 6. 원인 분석: TBT 150ms → 910ms

### 변경사항 타임라인

| 커밋 | 내용 | Bundler |
|------|------|---------|
| `ed04a50` (#328) | v2 측정 시점 | Webpack (serwist 암묵 의존) |
| `bbdd6f8` (#330) | `@serwist` 완전 제거 | **Turbopack** (Next.js 16 기본값으로 전환) |
| `b6d68cd` (#335) | `--webpack` 플래그 명시 | Webpack (재고정) |
| v3 측정 | PR #335 배포 후 | Webpack |

### 왜 TBT가 여전히 높은가?

v3은 Webpack으로 빌드됐음에도 TBT 910ms 기록. 원인:

1. **청크 수 증가**: 34개 JS 파일 (v2 대비 ~11개 증가 추정)
2. **코드베이스 성장**: PR #330~#335 사이 새로운 기능 추가 (gemini AI, recharts 등 의존성 증가)
3. **`4476-...js` 단독 613ms**: 가장 큰 병목. recharts, @uiw/react-md-editor 등 무거운 라이브러리 포함 가능성
4. **GA 스크립트 274ms**: `lazyOnload`이지만 메인 스레드에서 여전히 실행

### v2와 v3의 근본적 차이

v2(150ms TBT)는 `@serwist` Service Worker가 번들 사전 캐싱(precache)을 통해 반복 방문 최적화에 기여했을 가능성 있음. v3은 SW 없이 측정.

---

## 7. 다음 단계 개선 계획 (v4 목표)

### 우선순위 1: TBT 개선 (목표: < 300ms)

- [ ] **코드 스플리팅**: `4476-...js` 청크 분석 → `dynamic import()`로 지연 로드
  - recharts: 차트가 있는 페이지에서만 로드
  - `@uiw/react-md-editor`: 마크다운 에디터 사용 페이지에서만 로드
- [ ] **exceljs / xlsx**: 서버 전용으로 이동 (번들에 포함 시 수백KB)
- [ ] **GA 영향 최소화**: `strategy="afterInteractive"` 또는 Web Worker 실행 검토

### 우선순위 2: LCP 추가 개선 (목표: < 2.0s)

- [ ] LCP 요소 특정 후 `priority` 이미지 또는 폰트 preload
- [ ] Pretendard 폰트 subset 적용

### 우선순위 3: 미사용 JS 제거 (204KB → 목표 100KB)

- [ ] 청크별 미사용 원인 분석 (번들 분석기 실행: `ANALYZE=true pnpm build`)
- [ ] tree-shaking 미적용 라이브러리 교체 검토

---

## 8. 벤치마크 환경

| 항목 | 값 |
|------|-----|
| 측정 환경 | GitHub Actions ubuntu-latest |
| benchmarkIndex | 2,420 |
| Lighthouse 버전 | 12.x |
| Chrome | headless=new |
| 측정 시각 | 2026-06-20 10:03 UTC (19:03 KST) |
