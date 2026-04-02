@AGENTS.md
@DESIGN.md

# 기강 (Gigang) 프로젝트

러닝크루 "기강"의 공식 웹 애플리케이션. 멤버 관리 및 대회/기록 플랫폼.

## 기술 스택

- **프레임워크**: Next.js (App Router) + React 19 + TypeScript 5
- **DB/Auth**: Supabase (PostgreSQL + OAuth - 카카오/구글)
- **UI**: Tailwind CSS v4 + shadcn/ui (new-york style) + Radix UI
- **폼**: React Hook Form
- **배포**: Vercel + PWA (standalone 모드)
- **폰트**: Pretendard (본문), Nanum Myeongjo (제목)

## 핵심 원칙

- 언어: 한국어 (코드 주석, UI 텍스트 모두 한국어)
- 패키지 매니저: `pnpm`
- 경로 별칭: `@/*` → 프로젝트 루트
- **날짜/시간**: `lib/dayjs.ts` 유틸리티 사용. `new Date()` 직접 사용 금지. KST 기준
- **에이전트 활용**: 작업 영역에 맞는 서브에이전트에 위임할 것 (프론트엔드, 백엔드, DevOps)
- 상세 코딩 규칙은 `.claude/docs/coding-standards.md` 참조

## 브랜치 전략

```text
feature/* ──squash merge──▶ dev ──merge commit──▶ main
```

- PR 제목: Conventional Commits 형식 필수 (`feat`, `fix`, `chore`, `refactor`, `ci`, `perf`, `docs`, `style`, `test`, `build`, `revert`)
- `main` 머지 시 GitHub Action이 자동 semver 태그 + Release 생성

## 명령어

- `pnpm run dev` / `pnpm run build` / `pnpm run lint`

## 환경 변수

`.env.example` 참조. `.env`, `.env.*`, `secrets/` 파일은 절대 읽지 않음.

## 커스텀 커맨드

- `/sync-member-records` — 신규 가입 회원의 대회 기록/참가 등록을 temp 파일 기반으로 DB에 동기화
- `/pr` — PR 생성 시 반드시 이 스킬을 사용할 것

## MCP 서버

`.mcp.json`(Claude Code)과 `.cursor/mcp.json`(Cursor)은 동일한 설정을 공유한다. 변경 시 반드시 양쪽 동기화.

| MCP 서버 | 용도 |
|----------|------|
| `supabase-gigang-dev` | Supabase 개발 환경 |
| `supabase-gigang-prd` | Supabase 프로덕션 환경 |
| `vercel` | Vercel 배포 관리 |
| `chrome-devtools` | 브라우저 테스트/QA |
| `shadcn` | shadcn/ui 컴포넌트 검색 |

## 참고 문서

- `DESIGN.md` — 디자인 시스템 (토큰, 컴포넌트 카탈로그, AI 규칙)
- `.claude/docs/coding-standards.md` — 코딩 컨벤션, 보안, JSDoc, Git 규칙
- `.claude/docs/component-conventions.md` — 컴포넌트 작성 규칙, shadcn/ui 사용법
