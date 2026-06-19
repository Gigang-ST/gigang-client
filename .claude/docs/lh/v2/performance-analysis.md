# 기강 웹앱 성능 분석 보고서 v2

> 측정일: 2026-06-19  
> 측정 URL: https://gigang.team/  
> 측정 환경: GitHub Actions (ubuntu-latest, headless Chrome)  
> Lighthouse 버전: 최신 (npm install -g lighthouse)  
> 기준 비교: v1 (2026-06-19, 49점) → PR #328·#329 적용 후 재측정  
> Actions Run ID: 27808443117

---

## 1. 종합 점수

| 카테고리 | v1 (개선 전) | v2 (개선 후) | 변화 |
|----------|------------|------------|------|
| **Performance** | **49** 🔴 | **83** 🟢 | **+34점** |
| Accessibility | 88 🟡 | 88 🟡 | ± 0 |
| Best Practices | 93 🟢 | 93 🟢 | ± 0 |
| SEO | 92 🟢 | 92 🟢 | ± 0 |

---

## 2. 핵심 성능 지표 (Core Web Vitals)

| 지표 | v1 | v2 | 변화 | 기준 (Good) | 평가 |
|------|----|----|------|-------------|------|
| **FCP** (First Contentful Paint) | 1.1s | 1.1s | ± 0 | ≤ 1.8s | 🟢 좋음 |
| **LCP** (Largest Contentful Paint) | 5.6s | **3.6s** | **-2.0s** | ≤ 2.5s | 🟡 보통 |
| **TBT** (Total Blocking Time) | 1,810ms | **150ms** | **-1,660ms** | ≤ 200ms | 🟢 **달성** |
| **CLS** (Cumulative Layout Shift) | 0 | 0 | ± 0 | ≤ 0.1 | 🟢 완벽 |
| **SI** (Speed Index) | 4.7s | 6.4s | +1.7s | ≤ 3.4s | 🔴 악화 |
| **TTI** (Time to Interactive) | 5.8s | **4.9s** | **-0.9s** | ≤ 3.8s | 🟡 보통 |
| **TTFB** (서버 응답) | ~0ms | 20ms | ± 0 | ≤ 800ms | 🟢 완벽 |

### Lighthouse 점수 계산 가중치

```text
Performance = FCP(10%) + SI(10%) + LCP(25%) + TBT(30%) + CLS(25%)

v1: 9.9 + 6.8 + 4.5 + 2.7 + 25.0 = 48.9 ≈ 49
v2: 9.9 + 4.1 + 15.3 + 28.5 + 25.0 = 82.8 ≈ 83
```

> **주목:** TBT 점수 0.09(9점) → 0.95(28.5점) — 단일 지표 최대 개선. LCP 점수도 0.18 → 0.61로 크게 향상.  
> **역행:** Speed Index가 4.7s → 6.4s로 악화됨. 원인 분석 필요 (아래 5-1 참고).

---

## 3. 개선된 지표: TBT 분해

### v1 TBT 1,810ms (50ms 초과 작업 목록)

| 소요시간 | TBT 기여 | 원인 파일 |
|----------|----------|-----------|
| 386ms | 336ms | `8d867abb3cdfb30c.js` ← 레거시 폴리필 |
| 367ms | 317ms | Unattributable (React 하이드레이션) |
| 311ms | 261ms | `8d867abb3cdfb30c.js` ← 레거시 폴리필 |
| 275ms | 225ms | GTM (`googletagmanager.com/gtag/js`) |
| 214ms | 164ms | `gigang.team/` (홈 JS) |
| 209ms | 159ms | `8d867abb3cdfb30c.js` ← 레거시 폴리필 |
| 169ms | 119ms | `8d867abb3cdfb30c.js` ← 레거시 폴리필 |
| 159ms | 109ms | GTM |
| 143ms | 93ms | `8d867abb3cdfb30c.js` ← 레거시 폴리필 |
| **합계** | **~1,847ms** | |

### v2 TBT 150ms (50ms 초과 작업 목록)

| 소요시간 | TBT 기여 | 원인 파일 |
|----------|----------|-----------|
| 101ms | 51ms | `e50f0272f43ad504.js` |
| 95ms | 45ms | GTM (`googletagmanager.com/gtag/js`) |
| 82ms | 32ms | `e5808b9f02531565.js` |
| 75ms | 25ms | GTM |
| 61ms | 11ms | `ceb2560ffd2b72b7.js` |
| **합계** | **~164ms** | ≈ 150ms |

**변화 요약:**
- 레거시 폴리필(`8d867abb`) 완전 제거 → 5개 작업(386/311/209/169/143ms) 사라짐
- GTM 총 기여: 434ms → 70ms (lazyOnload 적용으로 타이밍 분산)
- 최대 단일 작업: 386ms → 101ms

---

## 4. LCP 3.6s 원인 분해

LCP 요소: `<p class="font-sans text-[13px]...">NO TIME TO BE WEAK</p>` (동일)

| 단계 | v1 | v2 | 변화 | 의미 |
|------|----|----|------|------|
| TTFB | 827ms (15%) | 746ms (21%) | -81ms | 서버 HTML 응답 → 정상 |
| Load Delay | 0ms | 0ms | ± 0 | 리소스 대기 없음 |
| Load Time | 0ms | 0ms | ± 0 | 리소스 다운로드 없음 |
| **Render Delay** | **4,753ms (85%)** | **2,852ms (79%)** | **-1,901ms** | JS가 렌더 지연 |
| **LCP 합계** | **5.6s** | **3.6s** | **-2.0s** | |

> **결론:** Render Delay가 4.75s → 2.85s로 -1.9초 단축됐지만 여전히 LCP의 79%를 차지.
> Good 기준(≤2.5s)까지 약 1.1s 추가 단축 필요 → React 하이드레이션 시간 단축이 핵심.

---

## 5. 현재 남은 병목

### 5-1. Speed Index 6.4s — v1보다 악화

SI는 화면이 시각적으로 "완성"되는 평균 속도. TBT가 줄었는데도 SI가 올랐다는 것은  
**화면 아랫부분(below-the-fold) 콘텐츠가 늦게 렌더되는 문제**일 수 있음.

가능한 원인:
- `CompetitionDetailDialog`와 `SchPostFormDialog`의 dynamic import → 홈 최초 렌더 직후 Lazy chunk를 fetch하는 워터폴 발생 가능
- 미니 캘린더 아래 소셜 섹션 등 스크롤 가능 콘텐츠가 지연 렌더됨
- Service Worker 프리캐시 워커 파일(8.47MB) 백그라운드 다운로드 시 브라우저 대역폭 경쟁

> **확인 필요:** 다이얼로그를 `{open && <Dialog />}` 조건부 렌더로 전환하면 SI 개선 여지 있음 (`improvement-plan.md` "다음 세션" 항목).

---

### 5-2. JS 번들 현황 (v2 기준)

```text
총 요청: 39개 | 총 전송 크기: 692.6KB | JS만: 591.4KB (27개)
```

| 청크 파일 | 크기 | Script 평가 시간 | 미사용 | 정체 |
|-----------|------|-----------------|--------|------|
| `e5808b9f02531565.js` | 69.8KB | **395ms** | 23KB | **미확인 — 조사 필요** |
| GTM (`googletagmanager`) | 159.2KB | 203ms | 64KB | Google Analytics |
| `e50f0272f43ad504.js` | 62.5KB | 101ms | 48.3KB (82%) | **미확인 — 고낭비** |
| `cb0207c629421593.js` | 56.3KB | — | 45.2KB (80%) | **미확인 — 고낭비** |
| `31c7ab8cf99964dc.js` | 35.1KB | — | 34.8KB (99%) | **100% 미사용** |
| `ceb2560ffd2b72b7.js` | — | 61ms | — | 미확인 |
| `e1c7a085cdbd7360.js` | 22.2KB | — | — | 미확인 |

**v1 → v2 번들 변화:**

| 항목 | v1 | v2 | 변화 |
|------|----|----|------|
| 총 JS | 688KB | 591.4KB | **-96.6KB** |
| 최대 청크 | 876KB (refractor) | 159.2KB (GTM) | 대폭 개선 |
| Zod 홈 포함 여부 | ✅ 포함 (275KB) | ❌ lazy chunk | **분리됨** |
| 폴리필 (`8d867abb`) | ✅ 224KB | ❌ 없음 | **제거됨** |

---

### 5-3. 미사용 JS 분석

| 파일 | 미사용 | 전체 크기 | 낭비율 |
|------|--------|----------|--------|
| GTM | 64KB | 158.8KB | 40% |
| `e50f0272f43ad504.js` | 48.3KB | 58.5KB | **82%** |
| `cb0207c629421593.js` | 45.2KB | 56.1KB | **80%** |
| `31c7ab8cf99964dc.js` | 34.8KB | 35.1KB | **99%** |
| `e5808b9f02531565.js` | 23KB | 69.6KB | 33% |
| **미사용 합계** | **~215KB** | | |

> v1 미사용 JS 240KB → v2 215KB (약 25KB 감소). 절대량은 비슷하나 패턴이 변함.  
> `31c7ab8cf99964dc.js`(35KB, 99% 미사용)가 새로운 최우선 제거 대상.

---

### 5-4. Script 평가 시간 (JS 파싱+실행)

| 파일 | 평가 시간 (총) | 스크립팅 | 기여 |
|------|--------------|----------|------|
| `e5808b9f02531565.js` | 395ms | 354ms | **최대 — 조사 필요** |
| GTM | 203ms | 167ms | lazyOnload 덕분에 타이밍 분산 |
| `e50f0272f43ad504.js` | 101ms | 81ms | |
| `ceb2560ffd2b72b7.js` | 61ms | 59ms | |
| **합계** | **~0.8s** | | v1 대비 크게 감소 |

> `e5808b9f02531565.js`가 평가 시간 395ms로 압도적 1위.  
> 이 파일의 정체 파악이 v3 개선의 핵심.

---

## 6. 미확인 청크 조사 방법

v2에서 청크 해시가 바뀌어 v1의 `8d867abb`, `0f560dba`, `709db452` 등의 대응 파일을 특정해야 함.

```bash
# 빌드 후 번들 분석기 실행
ANALYZE=true pnpm run build
# .next/analyze/ 에서 HTML 리포트 확인

# 특정 청크 내용 검색
cat .next/static/chunks/e5808b9f02531565.js | head -c 500
# 또는 pnpm exec next experimental-analyze
```

**추정:**
- `e5808b9f02531565.js` (69.8KB, 395ms): Supabase 클라이언트 코어 또는 React DOM일 가능성
- `e50f0272f43ad504.js` (62.5KB, 82% 미사용): 홈에선 불필요한 페이지별 공유 청크
- `31c7ab8cf99964dc.js` (35.1KB, 99% 미사용): 완전 미사용 — 어떤 컴포넌트가 이를 유발하는지 파악 필요

---

## 7. 성능 점수 비교표 (예측 vs 실측)

```text
v1 분석 당시 예측:
  Phase 1 (폴리필 제거): 60~65점
  Phase 2 (GTM lazyOnload): 68~72점
  Phase 3 (Zod 분리): 74~78점

실측 결과: 83점 (목표 74~78점 초과 달성)
```

| 지표 | v1 예측 (Phase 1+2+3) | 실측 v2 | 차이 |
|------|----------------------|---------|------|
| TBT | ~400ms | **150ms** | **예측보다 250ms 더 개선** |
| LCP | ~2.8s | 3.6s | 예측보다 0.8s 덜 개선 |
| Performance | 74~78 | **83** | **+5~9점 초과 달성** |

> **TBT가 예측보다 훨씬 더 좋아진 이유:** refractor와 Zod 제거의 시너지 효과. 폴리필만 제거해도 메인 스레드 점유 패턴이 바뀌면서 이후 작업들도 연쇄적으로 빨라짐.  
> **LCP가 예측보다 덜 개선된 이유:** TTFB(746ms)와 React 하이드레이션이 여전히 Render Delay를 만들고 있음. JS 번들 감소만으로는 서버 응답 타이밍을 당길 수 없음.

---

## 8. 개선 계획 (v3 목표: 90점)

### 현실적 목표

```text
Lighthouse 가중치: FCP(10%) + SI(10%) + LCP(25%) + TBT(30%) + CLS(25%)

현재 v2: 9.9 + 4.1 + 15.3 + 28.5 + 25.0 = 82.8 ≈ 83
90점 달성 조건: 각 지표 충족 필요
```

| 지표 | 현재 v2 | 90점 달성 필요값 | 필요 개선폭 |
|------|---------|----------------|------------|
| FCP | 1.1s (9.9점) | ≤ 1.0s | 미미 |
| **SI** | **6.4s (4.1점)** | **≤ 3.4s** | **-3.0s 필요** |
| **LCP** | **3.6s (15.3점)** | **≤ 2.5s** | **-1.1s 필요** |
| TBT | 150ms (28.5점) | ≤ 200ms | ✅ 달성 |
| CLS | 0 (25점) | 0 | ✅ 달성 |

> **90점 핵심:** SI와 LCP를 동시에 개선해야 함. 두 지표 모두 React 하이드레이션 지연과 연관.

---

### Phase A: 다이얼로그 진짜 클릭 시 렌더 (SI 개선)

**현재 문제:**  
`mini-calendar.tsx`에서 `CompetitionDetailDialog`와 `SchPostFormDialog`를 dynamic import했지만 `open={false}` 상태로 **항상 렌더**되고 있음. 결과적으로 홈 초기 렌더 직후 lazy chunk fetch 워터폴 발생 → SI 악화 가능성.

**변경 방향:**

```tsx
// 현재 (항상 렌더, lazy chunk는 즉시 fetch)
<SchPostFormDialog open={formOpen} ... />
<CompetitionDetailDialog open={compDetailOpen} ... />

// 개선 (클릭 시에만 마운트 → chunk도 클릭 시 fetch)
{formOpen && <SchPostFormDialog open={formOpen} ... />}
{compDetailOpen && <CompetitionDetailDialog open={compDetailOpen} ... />}
```

**기대 효과:**
- 홈 초기 JS chunk 워터폴 제거
- SI: 6.4s → ~4.5s 예상
- 첫 오픈 시 0.3~0.5초 딜레이 (허용 가능)

---

### Phase B: 미확인 고낭비 청크 제거

번들 분석 실행 후 `e50f0272f43ad504.js`(82% 미사용), `31c7ab8cf99964dc.js`(99% 미사용) 유입 경로 파악.

```bash
ANALYZE=true pnpm run build
# 또는
pnpm exec next experimental-analyze
```

**기대 효과:**
- 미사용 JS ~83KB 추가 제거 (e50f0272: 48.3KB + 31c7ab: 34.8KB)
- TBT: 150ms → 100ms 이하 예상

---

### Phase C: Service Worker 프리캐시 최적화

**현재:** `app/sw.ts`의 `precacheEntries: self.__SW_MANIFEST`가 `_next/static/**` 전체를 프리캐시 — 171개 URL, 8.47MB.

**문제:** 최초 방문 시 백그라운드에서 8.47MB 다운로드 → 모바일 데이터 낭비 + 브라우저 대역폭 경쟁으로 SI/LCP 간접 악화.

**변경 방향:**
- 홈에 필요한 핵심 JS/CSS만 프리캐시 (목표: ~1MB 이하)
- 나머지는 `StaleWhileRevalidate` 런타임 캐시로 전환

**기대 효과:**
- SI: ~6.4s → ~4.0s (대역폭 경쟁 해소)
- 반복 방문 로딩 유지

---

### Phase D: LCP ≤ 2.5s (고난이도)

LCP Render Delay 2,852ms(79%) — React 하이드레이션이 주원인.

**접근 방법 검토:**

| 방법 | 효과 예상 | 복잡도 |
|------|----------|--------|
| `e5808b9f02531565.js` 파악 및 lazy split | TBT/LCP 소폭 개선 | 중간 |
| PPR (Partial Prerendering) 적용 | LCP ~1.5s 가능 | 높음 |
| Supabase 클라이언트 서버 전용 분리 | 홈 번들 50KB+ 감소 | 중간 |
| 홈 클라이언트 컴포넌트 최소화 | 하이드레이션 범위 축소 | 높음 |

> PPR은 Next.js 15 정식 기능 — 홈을 정적 셸 + 동적 슬롯 구조로 리팩터하면 LCP ≤ 2.5s 달성 가능. 단, 대규모 리팩터 필요.

---

### 예상 점수 로드맵

```text
┌─────────────────────────┬───────┬───────────┬───────────┬───────────┐
│ 지표                     │ v2    │ Phase A   │ Phase A+B │ Phase A+C │
├─────────────────────────┼───────┼───────────┼───────────┼───────────┤
│ FCP                     │ 1.1s  │ 1.1s      │ 1.1s      │ 1.1s      │
│ LCP                     │ 3.6s  │ ~3.2s     │ ~3.0s     │ ~3.0s     │
│ TBT                     │ 150ms │ ~120ms    │ ~80ms     │ ~120ms    │
│ CLS                     │ 0     │ 0         │ 0         │ 0         │
│ SI                      │ 6.4s  │ ~4.5s     │ ~4.0s     │ ~3.5s     │
├─────────────────────────┼───────┼───────────┼───────────┼───────────┤
│ Performance             │  83   │  ~87      │  ~89      │  ~90      │
└─────────────────────────┴───────┴───────────┴───────────┴───────────┘
```

---

## 9. 측정 방법

### GitHub Actions 자동 측정 (매일 09:00 KST)

```yaml
# .github/workflows/lighthouse-daily.yml
# URL 입력 파라미터 추가됨 (v2 이후)
lighthouse "$TARGET_URL" \
  --output html --output json \
  --output-path ./lighthouse \
  --chrome-flags="--headless=new --no-sandbox"
```

### 수동 재측정 방법

```bash
# 프로덕션 측정
gh workflow run lighthouse-daily.yml --ref perf/next-optimizations

# 특정 URL 지정 측정 (v2 이후 가능)
gh workflow run lighthouse-daily.yml \
  --ref perf/next-optimizations \
  --field url=https://gigang-client-l3z8osung-gigangs-projects-afd6ab2d.vercel.app

# 결과 다운로드
gh run download <run-id> --name lighthouse-report -D /tmp/lh-v2
```

---

## 10. 참고: v1과의 측정 환경 차이

- **동일:** GitHub Actions ubuntu-latest, headless Chrome, 네트워크 쓰로틀링 4G, CPU 4x 슬로다운
- **다름:** Actions Runner 서버 상태(캐시 히트율, CPU 경합)에 따라 ±5~10점 편차 발생 가능
- **권장:** 동일 조건 3회 측정 후 평균값 사용

> v2 측정 시 Speed Index 악화(4.7s → 6.4s)는 실제 회귀보다 Actions Runner 상태 차이일 가능성도 있음.  
> Phase A 적용 전 동일 브랜치에서 2~3회 추가 측정 권장.
