---
name: Home Tab Replan
overview: 기존 전체 병목 순차 적용 전략에서 전환해, 홈탭만 대상으로 단계별(작은 변경→측정→다음 단계) 성능 개선을 진행하고 각 단계의 체감 개선 여부를 확인합니다.
todos:
  - id: baseline-home
    content: 홈탭 이중 페칭 제거 완료 상태를 기준선으로 확정하고 측정 템플릿을 고정한다.
    status: completed
  - id: step1-prefetch
    content: bottom-tab-bar prefetch 설정을 기본값으로 복원하고 체감/로그를 비교한다.
    status: completed
  - id: step2-main-loading
    content: app/(main)/loading.tsx를 추가해 탭 전환 즉시 피드백을 제공하고 검증한다.
    status: pending
  - id: step3-home-parallel
    content: 홈 서버 쿼리 병렬화 구조를 점검/개선하고 전후 시간을 비교한다.
    status: pending
  - id: step4-home-cache
    content: 홈 공개 데이터에 한해 캐싱을 적용하고 캐시 히트/미스를 분리 측정한다.
    status: pending
  - id: plan-sync
    content: 기존 performance plan 문서에 단계별 결과와 의사결정을 반영한다.
    status: pending
isProject: false
---

# 홈탭 단계별 체감개선 재계획

## 목표

- 이미 완료된 홈탭 이중 페칭 제거를 기준선으로 삼고, 홈탭 관련 개선만 순차 적용합니다.
- 각 단계마다 측정값/체감을 확인한 뒤 다음 단계로 진행하여, 불필요한 대규모 변경을 피합니다.
- 대회탭 최적화는 이번 범위에서 제외합니다.

## 범위와 원칙

- 포함: 홈탭 진입 체감(탭 클릭 후 콘텐츠/로딩 노출), 홈 데이터 페칭 구조, 홈 공개 데이터 캐싱.
- 제외: `RaceListView` 구조개선, 대회탭 캐싱/리팩터링.
- 방식: 1단계 적용 -> 측정 -> 효과 확인 -> 다음 단계 진행.

## 현재 기준선 (완료 상태)

- 홈탭 이중 페칭 제거는 완료 상태로 간주합니다.
- 확인 기준 문서: [C:\Users\wnsal\gigang-clientclaude\docs\perf-01-home-tab-change-log.md](C:\Users\wnsal\gigang-client.claude\docs\perf-01-home-tab-change-log.md)
- 관련 코드: [C:\Users\wnsal\gigang-client\appmain)\page.tsx](C:\Users\wnsal\gigang-client\app(main)\page.tsx), [C:\Users\wnsal\gigang-client\components\home\upcoming-races.tsx](C:\Users\wnsal\gigang-client\components\home\upcoming-races.tsx)

## 단계별 실행 계획

### 1) 홈 체감 우선: 탭 프리페치 활성화

- 변경: [C:\Users\wnsal\gigang-client\components\bottom-tab-bar.tsx](C:\Users\wnsal\gigang-client\components\bottom-tab-bar.tsx) 의 `prefetch={false}` 제거.
- 기대효과: 홈탭 진입 전 리소스 선로딩으로 탭 전환 체감 개선.
- 검증: 탭 전환 반복 시 클릭~콘텐츠 표시 시간 비교(기존 대비).

### 2) 홈 전환 UX 보강: `(main)` 라우트 로딩 추가

- 변경: [C:\Users\wnsal\gigang-client\appmain)\loading.tsx](C:\Users\wnsal\gigang-client\app(main)\loading.tsx) 신설.
- 방향: 홈/대회/랭킹/프로필 공통 레이아웃에 맞는 가벼운 스켈레톤.
- 기대효과: 실제 처리시간이 같아도 사용자 체감 지연 감소(즉시 피드백).
- 검증: 네트워크 느린 상황에서 탭 클릭 직후 로딩 노출 시간 확인.

### 3) 홈 서버 쿼리 구조 미세최적화

- 변경: [C:\Users\wnsal\gigang-client\appmain)\page.tsx](C:\Users\wnsal\gigang-client\app(main)\page.tsx)에서 `getUser()` 대기 구간과 공개 쿼리 구간 병렬화 재점검.
- 원칙: 인증 의존 없는 쿼리는 최대한 먼저 병렬 수행, 로그인 후속 쿼리는 조건부 분기.
- 기대효과: 홈 첫 렌더 TTFB/데이터 준비시간 단축.
- 검증: 동일 사용자 조건에서 평균 응답시간 비교.

### 4) 홈 공개 데이터 캐싱 (안전 범위)

- 변경: 홈의 공개 조회(멤버 수, 예정 대회/기록)만 `unstable_cache` 적용.
- 후보 파일: [C:\Users\wnsal\gigang-client\appmain)\page.tsx](C:\Users\wnsal\gigang-client\app(main)\page.tsx)
- 주의: 사용자별 데이터(내 대회/내 등록)는 캐싱 제외.
- 기대효과: 재방문 및 다수 사용자 공통 구간 응답 개선.
- 검증: 캐시 히트/미스 각각 체감 및 응답시간 기록.

### 5) 단계별 의사결정 규칙

- 각 단계 후 아래 중 하나를 결정:
  - 개선 체감/측정치가 유의미하면 다음 단계 진행
  - 개선이 미미하면 해당 단계 롤백 여부 검토 후 다음 우선순위로 이동
- 문서화: 기존 계획 문서 [C:\Users\wnsal\gigang-clientcursor\plans\performance_optimization_plan_590e0401.plan.md](C:\Users\wnsal\gigang-client.cursor\plans\performance_optimization_plan_590e0401.plan.md) 에 진행상태/결과 갱신

## 측정 기준 (간단 공통)

- 같은 기기/브라우저에서 5회 이상 반복 측정 후 평균값 사용.
- 최소 수집 항목:
  - 탭 클릭 -> 콘텐츠 표시(ms)
  - 탭 클릭 -> 로딩 UI 표시(ms)
  - 첫 방문(캐시 미스) / 재방문(캐시 히트) 분리 기록
- 기존 `TabLoadProbe` 로그를 유지하되, 단계별 전/후 수치를 동일 조건으로 비교합니다.

