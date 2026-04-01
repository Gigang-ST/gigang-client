# 코딩 스탠다드

## 일반 규칙

- TypeScript strict 모드 사용
- ESLint 규칙 준수 (`pnpm run lint`로 검증)
- 한국어 UI 텍스트, 한국어 주석
- 경로 별칭 `@/` 사용 (상대 경로 사용 금지)

## 파일 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 파일 | kebab-case | `race-list-view.tsx` |
| 페이지 | `page.tsx` | `app/(main)/races/page.tsx` |
| 레이아웃 | `layout.tsx` | `app/(main)/layout.tsx` |
| API 라우트 | `route.ts` | `app/api/revalidate/route.ts` |
| 서버 액션 | 기능명.ts | `app/actions/utmb.ts` |
| 유틸리티 | kebab-case | `date-utils.ts` |
| 타입 정의 | `types.ts` | `components/races/types.ts` |

## 임포트 순서

1. React / Next.js
2. 외부 라이브러리
3. `@/lib/` 유틸리티
4. `@/components/` 컴포넌트
5. 타입 임포트

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

### RLS (Row Level Security)
- Supabase RLS 정책이 적용되어 있으므로 별도 권한 체크 불필요
- 서버에서 `supabase.auth.getUser()`로 현재 사용자 확인

## 에러 처리

- Supabase 쿼리 결과의 `error` 체크
- 서버 액션에서 에러 발생 시 적절한 에러 메시지 반환
- 클라이언트에서 toast/alert로 사용자에게 알림

## Git 컨벤션

### 커밋 메시지
```
feat: 새 기능 추가
fix: 버그 수정
refactor: 리팩토링
style: 스타일/UI 변경
docs: 문서 변경
chore: 설정/빌드 변경
```

### 브랜치 네이밍
```
feat/feature-name
fix/bug-description
refactor/target
```

### PR 규칙
- main 브랜치에 직접 push 금지
- PR 생성 후 리뷰 필수
- 빌드 성공 확인 후 머지

## 공유 상수/유틸리티

- `lib/utils.ts` — `cn()`, `hasEnvVars`, `secondsToTime()`, `validateUUID()`
- `lib/constants.ts` — `BANK_OPTIONS` (은행 목록)
- `components/races/sport-config.ts` — `resolveSportConfig()`, `SPORT_LEGEND` (종목 설정)
- 중복 코드 방지: 상수/유틸리티는 반드시 공유 파일에서 import

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
