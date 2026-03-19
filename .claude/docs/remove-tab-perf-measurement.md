# 탭 전환 측정(TAB-PERF) 코드 제거 가이드

아래만 삭제하거나 되돌리면 된다.

## 운영(프로덕션)에서 측정 켜기 / 끄기

- **켜기** (본인 브라우저만, 다른 방문자에게는 로그 없음):

  ```js
  localStorage.setItem("GIGANG_TAB_PERF", "1");
  location.reload();
  ```

- **끄기**:

  ```js
  localStorage.removeItem("GIGANG_TAB_PERF");
  location.reload();
  ```

로컬(`pnpm dev`)에서는 위 설정 없이 항상 `[TAB-PERF]` 로그가 나간다.

## 측정이 의미하는 것

- **탭 클릭 시각**부터, 해당 탭의 **Suspense 안 비동기 본문(`*Content`)이 끝나고** `TabLoadProbe`가 마운트된 뒤 **다음 화면 페인트 직전**까지의 시간(대략 “본문이 그려질 준비가 된 뒤”)이다.
- 이미지 로딩·차트 내부 비동기 등 **자식 컴포넌트 추가 작업**까지는 포함하지 않을 수 있다.

## 삭제할 파일

- `lib/perf-tab.ts`
- `components/perf/tab-load-probe.tsx`
- `본 문서` (`remove-tab-perf-measurement.md`)

## 수정할 파일

### `components/bottom-tab-bar.tsx`

- `import { markTabClickStart } from "@/lib/perf-tab";` 제거
- `<Link>`의 `onClick={() => markTabClickStart(tab.href, tab.label)}` 제거

### `app/(main)/page.tsx`

- `import { TabLoadProbe } from "@/components/perf/tab-load-probe";` 제거
- `HomeContent` 반환 JSX 맨 아래에 있는 `<TabLoadProbe href="/" label="홈" />` 한 줄 제거

### `app/(main)/races/page.tsx`

- `import { TabLoadProbe } from "@/components/perf/tab-load-probe";` 제거
- `RacesContent` 반환의 `<>` 안, `RaceListView` 아래에 있는 `<TabLoadProbe href="/races" label="대회" />` 제거 (fragment 래핑도 원래대로 단일 `RaceListView`만 남기면 됨)

### `app/(main)/records/page.tsx`

- `import { TabLoadProbe } from "@/components/perf/tab-load-probe";` 제거
- `RecordsContent` 반환의 `<>` 안, `RecordsClient` 아래에 있는 `<TabLoadProbe href="/records" label="랭킹" />` 제거 (단일 `RecordsClient`만 남기면 됨)

### `app/(main)/profile/page.tsx`

- `import { TabLoadProbe } from "@/components/perf/tab-load-probe";` 제거
- `ProfileContent` 반환 맨 아래에 있는 `<TabLoadProbe href="/profile" label="프로필" />` 한 줄 제거
