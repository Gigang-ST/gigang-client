---
paths:
  - "app/api/**/*.ts"
  - "lib/actions/**/*.ts"
  - "lib/queries/**/*.ts"
---

# API / 서버 액션 규칙

## Supabase 클라이언트
```typescript
// 서버 컴포넌트 / 서버 액션 / Route Handler
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient(); // await 필수

// 클라이언트 컴포넌트
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

## 인증 & 보안
- 모든 API 라우트 인증/인가 검증 필수
- 웹훅 엔드포인트: `x-webhook-secret` 헤더로 `REVALIDATE_SECRET` 검증
- **개인정보 노출 절대 금지**: 전화번호, 계좌정보, OAuth ID를 응답/로그에 포함 금지
- 입력값 Zod로 서버 사이드 검증 필수
- `validateUUID()` — PostgREST `.or()` 필터에 사용자 입력 삽입 시 필수
- 서버 액션 데이터 변경 전 `supabase.auth.getUser()` 인증 확인
- 삭제 쿼리에 `member_id` 조건 포함 (타 사용자 데이터 보호)

## 환경변수
- `lib/env.ts`에서 import (`process.env` 직접 접근 금지)
- 서버 전용: `SUPABASE_SERVICE_ROLE_KEY`, `REVALIDATE_SECRET`, `KAKAO_CHAT_PASSWORD`

## 공통코드 캐시 패턴
참조 데이터(종목, 이벤트 서브그룹 등)는 직접 Supabase 쿼리 대신 캐시 헬퍼 사용:
```typescript
import { getCachedCmmCdRows, cmmCdRowsForGrp } from "@/lib/queries/cmm-cd-cached";

const rows = await getCachedCmmCdRows();
const sportOptions = cmmCdRowsForGrp(rows, "COMP_SPRT_CD"); // { cd, cd_nm }[]
```
- 캐시 무효화: `revalidateTag(COMMON_CODES_CACHE_TAG, "max")` (`lib/common-codes-cache-tag.ts`)
- 서버 액션에서 입력 검증용으로도 사용 가능

## 응답 & 성능
- HTTP 상태 코드 적절히 사용 (200, 201, 400, 401, 403, 404, 500)
- 에러 응답: `{ error: string }` 형식 통일
- `select("*")` 지양 — 필요한 컬럼만 조회
- N+1 쿼리 방지 — join/embed 활용
- 서버 액션 완료 후 `revalidatePath` / `revalidateTag` 호출
