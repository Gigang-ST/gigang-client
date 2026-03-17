# 기강 (Gigang)

스포츠 팀 **기강**의 공식 웹 애플리케이션.
러닝, 자전거, 수영, 트레일러닝 등을 함께하는 스포츠 팀의 멤버 관리 및 대회/기록 플랫폼입니다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js (App Router) + React 19 + TypeScript 5 |
| DB / Auth | Supabase (PostgreSQL + OAuth — 카카오, 구글) |
| UI | Tailwind CSS v4 + shadcn/ui (new-york) + Radix UI |
| 폼 | React Hook Form |
| 배포 | PWA (standalone 모드) |
| 폰트 | Pretendard (본문), Nanum Myeongjo (제목) |

## 프로젝트 구조

```
app/
  (main)/          # 메인 탭 (홈, 대회, 기록, 프로필) — BottomTabBar 포함
  (info)/          # 정보 페이지 (가입안내, 규칙, 약관 등) — BackHeader 포함
  (protected)/     # 인증 필수 페이지 (온보딩)
  auth/            # 인증 (로그인, OAuth 콜백, 에러, 가입완료)
  api/             # API 라우트
  actions/         # 서버 액션
components/
  ui/              # shadcn/ui 공통 컴포넌트
  auth/            # 인증 관련
  races/           # 대회 관련
  profile/         # 프로필 관련
lib/
  supabase/        # Supabase 클라이언트 (server / client / proxy)
  utils.ts         # cn() 등 유틸리티
```

## 시작하기

### 사전 준비

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — 로컬 DB 및 마이그레이션 관리
- [Pencil](https://pencil.dev/) — 디자인 파일(`.pen`) 편집

### 설치 및 실행

```bash
# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.example .env.local
# .env.local 파일을 열어 Supabase URL, Key 등을 입력

# 개발 서버 실행
pnpm run dev
```

개발 서버가 [localhost:3000](http://localhost:3000/)에서 실행됩니다.

### Supabase 로컬 개발

```bash
# Supabase 로컬 서비스 시작
supabase start

# DB 마이그레이션 상태 확인
supabase migration list

# 원격 DB 변경사항을 로컬로 가져오기
supabase db pull

# 로컬 변경사항으로 마이그레이션 생성
supabase db diff -f <migration_name>
```

### 디자인 파일

프로젝트 루트의 `gigang.pen` 파일이 디자인 소스입니다. [Pencil](https://pencil.dev/)로 열어 확인할 수 있습니다.

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 개발 서버 실행 |
| `pnpm run build` | 프로덕션 빌드 |
| `pnpm run lint` | ESLint 검사 |
