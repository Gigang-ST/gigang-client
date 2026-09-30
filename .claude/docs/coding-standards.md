# 코딩 스탠다드

## 일반 규칙

- ESLint 규칙 준수 (`pnpm run lint`로 검증)
- 한국어 UI 텍스트, 한국어 주석
- import 순서, 상대 경로 금지 등은 ESLint가 자동 강제 (`eslint-plugin-import`)

## 파일 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 파일 | kebab-case | `race-list-view.tsx` |
| 페이지 | `page.tsx` | `app/(main)/races/page.tsx` |
| 레이아웃 | `layout.tsx` | `app/(main)/layout.tsx` |
| API 라우트 | `route.ts` | `app/api/revalidate/route.ts` |
| 서버 액션 | 기능명.ts | `app/actions/update-profile.ts` |
| 유틸리티 | kebab-case | `date-utils.ts` |
| 타입 정의 | `types.ts` | `components/races/types.ts` |

## Supabase 사용

### 서버 컴포넌트/서버 액션
```typescript
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient(); // await 필수
```

### 클라이언트 컴포넌트
```typescript
import { createClient } from "@/lib/supabase/client";
const supabase = createClient(); // await 불필요
```

### 대량 조회 — PostgREST 1000행 상한

PostgREST는 한 요청에 최대 1000행(`max_rows`)만 돌려주고 **잘렸다는 에러를 내지 않는다.**
결과가 틀려도 아무도 모른다 — 환급액이 낮게 계산되고, 칭호가 빠지고, 대회가 목록에서 사라졌다.

**판단 질문: "이 결과는 시간이 갈수록 늘어나는가?"** 늘어나면 `fetchAllRows`를 쓴다.

| 쓴다 (`fetchAllRows`) | 안 써도 된다 |
|---|---|
| 팀 전체·기간 전체를 읽는 조회 — 참석(`gthr_attd_rel`)·취소 이력·기록·칭호 보유·포인트 원장·알림·대회 목록 | 한 사람 몫(`.eq("mem_id", …)` 등)·한 모임/글 몫 |
| "한 달 치"라도 **사람 수만큼** 느는 조회(마일리지런 월 기록 — 참가자가 늘면 는다) | `.limit(n)`으로 일부러 자른 조회, `.single()`/`.maybeSingle()` |
| `.in(col, ids)`로 여러 대상을 한 번에 읽는 조회(청크로 나눠도 청크 하나가 넘을 수 있다 — `selectInChunks`가 알아서 한다) | `count: "exact", head: true` (개수는 정확하다) |
| 지금 몇 백 행인 것 — **넘는 순간 조용히 틀린다** | JSON 한 덩어리를 돌려주는 RPC (SETOF/TABLE RPC는 상한에 걸린다) |

```typescript
import { fetchAllRows } from "@/lib/supabase/fetch-all";

const rows = await fetchAllRows(
  () =>
    supabase
      .from("gthr_attd_rel")
      .select("mem_id, gthr_id")
      .eq("gthr_mst.team_id", teamId)
      .order("attd_id", { ascending: true }), // 유일한 키 정렬 필수, .range()는 붙이지 않는다
  { label: "participation:gthr_attd_rel" }, // 실패 메시지에 찍힌다
);
```

- **쿼리를 만드는 함수**를 넘긴다 — 빌더는 재사용이 안 돼 페이지마다 새로 만든다.
- **`.range()`는 붙이지 않는다** — 헬퍼가 붙인다(호출부가 붙이면 깜빡했을 때 무한 루프).
- **정렬은 유일한 키로.** `crt_at`·`stt_dt`처럼 겹칠 수 있으면 PK를 두 번째 정렬로 덧붙인다.
  정렬이 없으면 헬퍼가 실행 시 던진다.
- **실패하면 던진다.** 클라이언트 컴포넌트는 `try/catch`로 받아 이전 상태를 두거나 비운다.
- 직접 `for` + `.range()` 루프를 새로 짜지 않는다 — 한 곳에만 있어야 규칙(정렬·실패 처리)이 안 갈린다.
- ⚠️ **검증은 앱과 같은 경로로.** `execute_sql`(직접 Postgres)은 이 상한을 안 겪는다 —
  "DB 값은 맞다"와 "앱이 그 값을 다 읽는다"는 다른 말이다(KNOWLEDGE §1,000행 상한).

### RLS (Row Level Security)
- Supabase RLS 정책이 적용되어 있으므로 별도 권한 체크 불필요
- 서버에서 `supabase.auth.getUser()`로 현재 사용자 확인

## 에러 처리

- Supabase 쿼리 결과의 `error` 체크
- 서버 액션에서 에러 발생 시 적절한 에러 메시지 반환
- 클라이언트에서 toast/alert로 사용자에게 알림

## 보안 규칙

- `.env`, `.env.*`, `secrets/` 파일 접근 금지
- API 키, 시크릿을 코드에 하드코딩 금지 → 환경변수 사용 (예: `KAKAO_CHAT_PASSWORD`)
- 서버 전용 비밀 값은 `process.env`로 서버 컴포넌트에서만 읽기 (클라이언트 번들 노출 방지)
- `x-webhook-secret` 등 인증 헤더 검증 필수
- XSS, SQL Injection 등 OWASP Top 10 방지
- PostgREST `.or()` 필터에 사용자 입력 삽입 시 `validateUUID()` 검증 필수
- `source_url` 등 외부 URL 렌더링 시 `http://` 또는 `https://` 프로토콜 검증
- 서버 액션에서 데이터 변경 전 `supabase.auth.getUser()` 인증 확인
- 삭제 쿼리에 `member_id` 조건 포함하여 타 사용자 데이터 보호
- 은행 계좌 등 입력 필드는 허용 문자만 필터링 (숫자, 하이픈 등)
- 날짜 입력 필드에 `max="9999-12-31"` 속성 추가 (6자리 연도 입력 방지)

## Git 커밋 워크플로우

- **커밋 후 반드시 `git status` 확인** — lint-staged(eslint --fix)가 import 순서 등을 auto-fix한 뒤 working tree에 변경사항을 남기는 경우가 있음. 커밋 성공 후에도 unstaged 변경사항이 남아 있으면 추가로 커밋·푸시 필요.
- 푸시 전 `git status`가 clean인지 확인한다.

## Playwright 스크린샷

- 스크린샷 저장 경로: `temp/playwright/` (gitignore 대상)
- MCP Playwright로 스크린샷 찍을 때 `filename` 파라미터에 `temp/playwright/` 접두사 사용

## JSDoc 규칙

### 작성 대상
- **필수**: export 함수, 사이드 이펙트가 있는 함수, 복잡한 반환 구조를 가진 함수
- **생략 가능**: 이름만으로 의미가 명확한 trivial 함수 (e.g. `cn()`, 단순 getter)

### 태그 규칙

| 태그 | 사용 시점 | 비고 |
|------|----------|------|
| `@param` | 파라미터가 있으면 항상 | 타입 생략 (TS가 처리). 의미·제약·기본값을 기술 |
| `@returns` | 반환값이 있으면 항상 | 반환 구조, `null`/`undefined` 조건, Promise resolve 값 명시 |
| `@throws` | 에러를 throw하면 항상 | 조건과 에러 종류 기술 |
| `@example` | 사용법이 비자명한 함수 | 실제 호출 코드 포함 |
| `@see` | 관련 함수/모듈 참조 시 | `@see {@link functionName}` 형태 |
| `@deprecated` | 폐기 예정 함수 | 대체 함수 안내 필수 |

### 설명 원칙
- "what/when"을 쓰고, "how"는 쓰지 않는다
- 함수명·파라미터명을 그대로 반복하지 않는다
- 타입을 JSDoc에 중복 기재하지 않는다 (TypeScript가 처리)
