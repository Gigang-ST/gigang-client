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
- `<TabLoadProbe href="/" label="홈" />` 한 줄 제거

### `app/(main)/races/page.tsx`

- `import { TabLoadProbe } from "@/components/perf/tab-load-probe";` 제거
- `<TabLoadProbe href="/races" label="대회" />` 한 줄 제거

### `app/(main)/records/page.tsx`

- `import { TabLoadProbe } from "@/components/perf/tab-load-probe";` 제거
- `<TabLoadProbe href="/records" label="랭킹" />` 한 줄 제거

### `app/(main)/profile/page.tsx`

- `import { TabLoadProbe } from "@/components/perf/tab-load-probe";` 제거
- `<TabLoadProbe href="/profile" label="프로필" />` 한 줄 제거
