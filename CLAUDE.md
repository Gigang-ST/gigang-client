# 기강 (Gigang) 프로젝트

스포츠 팀 "기강"의 공식 웹 애플리케이션. 러닝, 자전거, 수영, 트레일러닝 등을 함께하는 스포츠 팀 멤버 관리 및 대회/기록 플랫폼.

## 기술 스택

- **프레임워크**: Next.js (App Router) + React 19 + TypeScript 5
- **DB/Auth**: Supabase (PostgreSQL + OAuth - 카카오/구글)
- **UI**: Tailwind CSS v4 + shadcn/ui (new-york style) + Radix UI
- **폼**: React Hook Form
- **배포**: PWA (standalone 모드)
- **폰트**: Pretendard (본문), Nanum Myeongjo (제목)

## 프로젝트 구조

```
app/
  (main)/          # 메인 탭 페이지 (홈, 대회, 기록, 프로필) - BottomTabBar 포함
  (info)/          # 정보 페이지 (가입안내, 규칙, 약관, 신규가입 등) - BackHeader 포함
  (protected)/     # 인증 필수 페이지 (온보딩)
  auth/            # 인증 (로그인, OAuth 콜백, 에러, 가입완료)
  api/             # API 라우트 (revalidate 웹훅)
  actions/         # 서버 액션
components/
  ui/              # shadcn/ui 공통 컴포넌트
  auth/            # 인증 관련 컴포넌트
  races/           # 대회 관련 컴포넌트
  profile/         # 프로필 관련 컴포넌트
  in-app-browser-gate.tsx  # 인앱브라우저 감지 → 외부 브라우저 유도
lib/
  supabase/        # Supabase 클라이언트 (server/client/proxy)
  dayjs.ts         # 날짜/시간 유틸리티 (KST 기준, dayjs 기반)
  utils.ts         # cn() 유틸리티
```

## 주요 규칙

- 언어: 한국어 (코드 주석, UI 텍스트 모두 한국어)
- 패키지 매니저: `pnpm`
- 경로 별칭: `@/*` → 프로젝트 루트
- 서버 컴포넌트 기본, 클라이언트 필요시 `"use client"` 선언
- Supabase 서버 클라이언트: `lib/supabase/server.ts`의 `createClient()` 사용
- Supabase 브라우저 클라이언트: `lib/supabase/client.ts`의 `createClient()` 사용
- 스타일: Tailwind CSS 유틸리티 클래스 사용, `cn()` 으로 클래스 병합
- 컴포넌트: shadcn/ui 기반, `components/ui/`에 위치
- **날짜/시간**: 반드시 `lib/dayjs.ts` 유틸리티 사용. 네이티브 `new Date()` 직접 사용 금지. Locale은 항상 KST(Asia/Seoul) 기준

## 브랜치 전략 & 커밋 컨벤션

### 브랜치 전략
```text
feature/* ──squash merge──▶ dev (승인 1명, CODEOWNERS 리뷰)
dev ──merge commit──▶ main (승인 2명, 스레드 해결 필수, CODEOWNERS 리뷰)
```

### PR 제목 (Conventional Commits)
PR 제목은 반드시 Conventional Commits 형식을 따라야 한다. GitHub Action(`amannn/action-semantic-pull-request`)이 자동 검증.

**형식**: `type(scope): 설명` (scope는 선택사항)

**허용 타입**:

| 타입 | 용도 |
|------|------|
| `feat` | 새로운 기능 |
| `fix` | 버그 수정 |
| `chore` | 빌드/설정 변경 |
| `refactor` | 리팩토링 |
| `ci` | CI/CD 변경 |
| `perf` | 성능 개선 |
| `docs` | 문서 변경 |
| `style` | 코드 스타일 (포맷팅 등) |
| `test` | 테스트 추가/수정 |
| `build` | 빌드 시스템 변경 |
| `revert` | 이전 커밋 되돌리기 |

**예시**:
- `feat: 이벤트 탭 개발`
- `feat(auth): 카카오 로그인 추가`
- `fix(races): 대회 등록 RLS 차단 해결`
- `chore: Netlify 관련 설정 제거`

### 배포 환경

| 환경 | Vercel 프로젝트 | 플랜 | 트리거 브랜치 |
|------|----------------|------|--------------|
| 프로덕션 | `gigang-client` | Hobby | `main` |
| 개발계 | `gigang-client-dev` | Hobby | `dev` |
| 테스트 | `gigang-client-test` | Hobby | — |

### 릴리스 (자동)

`main`에 머지되면 GitHub Action이 자동으로:
1. Conventional commits 분석 → semver 태그 자동 생성 (`feat` → minor, `fix` → patch)
2. GitHub Release 생성 (PR 기반 릴리스 노트 자동 분류)

## 명령어

- `pnpm run dev` - 개발 서버
- `pnpm run build` - 프로덕션 빌드
- `pnpm run lint` - ESLint 검사

## 환경 변수

`.env.example` 참조. `.env`, `.env.*`, `secrets/` 파일은 절대 읽지 않음.

## 환경 변수 (서버 전용)

- `KAKAO_CHAT_PASSWORD` — 카카오 오픈채팅 비밀번호 (가입완료 페이지에서 사용, Vercel 환경변수로 관리)

## 커스텀 커맨드

- `/sync-member-records` — 신규 가입 회원의 대회 기록/참가 등록을 temp 파일 기반으로 DB에 동기화

## 에이전트 참고 문서

상세 가이드는 `.claude/docs/` 디렉토리 참조:
- `architecture.md` - 라우팅, 레이아웃, 인증 흐름 상세
- `database-schema.md` - DB 테이블, 관계, 쿼리 패턴
- `component-conventions.md` - 컴포넌트 작성 규칙, shadcn/ui 사용법
- `coding-standards.md` - 코딩 컨벤션, PR 규칙
