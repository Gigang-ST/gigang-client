# 공통코드(cmm_cd) 서버 캐시

에이전트/개발자가 `sport-config` 등 하드코딩을 공통코드로 옮기거나, 새 화면에서 참조 데이터를 쓸 때 **이 문서와 함께** `lib/queries/cmm-cd-cached.ts`를 기준으로 구현하면 된다.

## 목적

- **소스 오브 트루스**: `cmm_cd_grp_mst`, `cmm_cd_mst`(v2 공통코드).
- **매 요청마다 Supabase 직통 조회를 피함**: Next.js `unstable_cache` + React `cache()`.
- **데이터 변경 시**: `revalidateTag`로 캐시 무효화 후 다음 요청에서 다시 로드.

행 수가 수십~수백 건 규모라 전체를 한 번에 캐시해도 부담이 작다.

## 관련 파일

| 파일 | 역할 |
|------|------|
| `lib/common-codes-cache-tag.ts` | `COMMON_CODES_CACHE_TAG` 상수 (`"common-codes"`). `revalidateTag`와 `unstable_cache`의 `tags`가 동일해야 한다. |
| `lib/queries/cmm-cd-cached.ts` | 조회·병합·캐시 래퍼, `CachedCmmCdRow` 타입, `cmmCdRowsForGrp` 헬퍼. |
| `app/api/revalidate/route.ts` | 웹훅 POST 시 `revalidateTag(COMMON_CODES_CACHE_TAG)` 호출로 공통코드 캐시도 함께 무효화. |

## DB 가정

- `cmm_cd_grp_mst`: `vers = 0`, `del_yn = false` 인 그룹만.
- `cmm_cd_mst`: `vers = 0`, `del_yn = false`, `use_yn = true` 인 코드만.
- 클라이언트는 **`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** 로 읽는다(기존 `races/page.tsx`의 anon 패턴과 동일). RLS로 anon/authenticated SELECT 허용된 공통코드 테이블 전제.

스키마·코드값 목록은 `database-schema-v2.md` §10, 마이그레이션 `20260404064718_v2_wave1_common_code.sql` 등을 참고한다.

## 캐시 동작

1. **`unstable_cache`**
   - 키: `["cmm-cd-all-rows"]` (고정 문자열).
   - `tags: [COMMON_CODES_CACHE_TAG]`
   - `revalidate: 86400` (초 단위; 태그 무효화가 주된 갱신 경로).

2. **`cache()` (`getCachedCmmCdRows`)**
   - **동일한 React 서버 렌더 트리** 안에서 `getCachedCmmCdRows()`를 여러 번 호출해도, 그 요청에서는 한 번만 실제 캐시 함수가 실행되도록 중복 제거.

3. **무효화**
   - `revalidateTag(COMMON_CODES_CACHE_TAG, "max")` (Next 15+ 시그니처).
   - 웹훅: `app/api/revalidate/route.ts` 에서 대회/records와 같이 호출됨.
   - 향후 **관리 화면에서 공통코드를 수정**하는 서버 액션이 생기면, 저장 성공 후에도 동일 태그로 `revalidateTag`를 호출한다.

## 공개 API

### `getCachedCmmCdRows()`

```ts
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";

const rows = await getCachedCmmCdRows();
// CachedCmmCdRow[] — { cd_grp_cd, cd, cd_nm, sort_ord }
```

- **서버 전용** 호출을 권장한다(서버 컴포넌트, 서버 액션, Route Handler 등).
- 반환 배열은 **그룹 코드 문자열 기준 정렬 후, 그룹 내 `sort_ord` 정렬**이다.

### `cmmCdRowsForGrp(rows, cdGrpCd)`

```ts
import { getCachedCmmCdRows, cmmCdRowsForGrp } from "@/lib/queries/cmm-cd-cached";

const rows = await getCachedCmmCdRows();
const sprt = cmmCdRowsForGrp(rows, "COMP_SPRT_CD");
// { cd, cd_nm }[] — UI 셀렉트 옵션 등
```

- 추가 DB 라운드트립 없이 메모리에서 필터한다.
- 대회 스포츠: `COMP_SPRT_CD`, 이벤트 서브그룹: `ROAD_EVT_CD` 등(마이그레이션 참고).

### `COMMON_CODES_CACHE_TAG`

```ts
import { COMMON_CODES_CACHE_TAG } from "@/lib/common-codes-cache-tag";
import { revalidateTag } from "next/cache";

revalidateTag(COMMON_CODES_CACHE_TAG, "max");
```

## 사용 패턴 (권장)

### 서버 컴포넌트에서 한 번 불러 props로 전달

```tsx
// page.tsx (Server Component)
import { getCachedCmmCdRows, cmmCdRowsForGrp } from "@/lib/queries/cmm-cd-cached";

export default async function Page() {
  const rows = await getCachedCmmCdRows();
  const sportOptions = cmmCdRowsForGrp(rows, "COMP_SPRT_CD");
  return <ClientForm sportOptions={sportOptions} />;
}
```

- 클라이언트 컴포넌트에는 **직렬화 가능한 배열만** 넘긴다(`cd`, `cd_nm` 등).
- 그룹이 많아져도 **항상 `getCachedCmmCdRows` 한 번**이면 되고, 필요한 그룹만 `cmmCdRowsForGrp`로 잘라 쓴다.

### 서버 액션에서 검증용

```ts
"use server";
import { getCachedCmmCdRows, cmmCdRowsForGrp } from "@/lib/queries/cmm-cd-cached";

const rows = await getCachedCmmCdRows();
const allowed = new Set(cmmCdRowsForGrp(rows, "COMP_SPRT_CD").map((r) => r.cd));
if (!allowed.has(input.sport)) return { ok: false, message: "유효하지 않은 종목" };
```

## `sport-config` 대체 시 체크리스트 (향후 작업)

에이전트에게 지시할 때 아래를 붙이면 된다.

1. UI/검증에서 `components/races/sport-config.ts` 의 목록·라벨·이벤트 타입을 제거할 계획인지 명시.
2. **스포츠 코드(`comp_sprt_cd`) ↔ 이벤트 코드 그룹(`ROAD_EVT_CD` 등)** 매핑은 DB FK가 없을 수 있으므로, 필요하면 `lib/`에 작은 매핑 테이블(상수)을 두고 공통코드 `cd`와 맞출 것.
3. 모든 진입 경로(대회 탭, 기록 입력, 관리자)에서 **동일한 `getCachedCmmCdRows` 결과**를 쓰도록 통일.
4. 변경 후 `pnpm run lint` / 해당 플로우 수동 QA.

## 주의사항

- **`process.env` 직접 사용 금지** — 이 모듈은 이미 `lib/env`의 `NEXT_PUBLIC_*`만 사용한다.
- 캐시 키/태그 문자열을 바꾸면 배포 직후 한동안 구 캐시가 남을 수 있으니, **태그 이름 변경은 마이그레이션 수준**으로 다룬다.
- **조회 실패(네트워크·Supabase 오류 등)** 시에는 `getCachedCmmCdRows`가 **예외를 던진다**. `unstable_cache`에 빈 배열이 담기지 않게 하기 위함이다. UI/에러 경계에서 처리한다.
- **DB에 코드가 없는 정상 상태**면 **빈 배열**을 반환하며 캐시된다. UI는 빈 옵션 등으로 방어한다.

## 에이전트에게 넘길 때 한 줄 프롬프트 예시

> 공통코드는 `.claude/docs/common-codes-cache.md` 와 `lib/queries/cmm-cd-cached.ts` 만 사용해서 불러와. 목록은 `getCachedCmmCdRows` → `cmmCdRowsForGrp`. 갱신은 `COMMON_CODES_CACHE_TAG`로 `revalidateTag`.
