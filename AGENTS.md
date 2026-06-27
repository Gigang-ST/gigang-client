<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

## Reference

- [Next.js Evals](https://nextjs.org/evals) — 번들 문서 + AGENTS.md가 실제 에이전트 성능에 미치는 벤치마크 결과

<!-- END:nextjs-agent-rules -->

# 기강 (Gigang) 프로젝트

러닝크루 "기강"의 공식 웹 애플리케이션. 멤버 관리 및 대회/기록 플랫폼.

## 기술 스택

- **프레임워크**: Next.js (App Router) + React 19 + TypeScript 5
- **DB/Auth**: Supabase (PostgreSQL + OAuth - 카카오/구글)
- **UI**: Tailwind CSS v4 + shadcn/ui (new-york style) + Radix UI
- **폼**: React Hook Form + Zod (스키마 검증)
- **환경변수**: t3-env (`lib/env.ts`) — 타입 안전한 환경변수 관리
- **배포**: Vercel + PWA (standalone 모드)
- **폰트**: Pretendard (본문), Nanum Myeongjo (제목)

## 핵심 원칙

- 언어: 한국어 (코드 주석, UI 텍스트 모두 한국어)
- 패키지 매니저: `pnpm`
- 경로 별칭: `@/*` → 프로젝트 루트
- **날짜/시간**: `import { dayjs } from "@/lib/dayjs"` 만 사용. `import dayjs from "dayjs"` 직접 import 금지. `new Date()` 직접 사용 금지. 날짜 포맷팅 시 `.slice()` / `.replace()` 문자열 조작 금지 — 반드시 `dayjs(val).format("YY.MM.DD")` 형태로. KST 기준
- **환경변수**: `lib/env.ts`에서 import. `process.env` 직접 접근 금지 (t3-env가 런타임 검증)
- **멤버 조회**: `getCurrentMember()` (`lib/queries/member.ts`) — React cache()로 같은 렌더 내 중복 쿼리 방지
- **폼 검증**: Zod 스키마를 `lib/validations/`에 정의하고 React Hook Form과 통합
- **에이전트 활용**: 작업 영역에 맞는 서브에이전트에 위임할 것 (프론트엔드, 백엔드, DevOps)
- 상세 코딩 규칙은 `.claude/docs/coding-standards.md` 참조

## 멤버 인증/조회 패턴

```typescript
// 서버 컴포넌트/서버 페이지에서 직접 호출 (React cache()로 중복 방지)
import { getCurrentMember } from "@/lib/queries/member";
const { user, member, supabase } = await getCurrentMember();
// user=null → 비로그인, member=null → 로그인했지만 미가입, member → 가입완료
// supabase 클라이언트를 후속 쿼리에 재사용 가능

// 클라이언트 폼이 필요한 페이지: 서버 wrapper + client form 패턴
// page.tsx (서버) → 데이터 조회 + 리다이렉트 → ClientForm (클라이언트) props 전달
```

- Context/Provider 패턴 미사용 — 각 페이지가 자기 데이터를 직접 조회
- 관리자 확인: `verifyAdmin()` (`lib/queries/member.ts`)

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

t3-env로 관리되며 `lib/env.ts`에서 import:

| 변수 | 서버/클라이언트 | 용도 |
|------|---------------|------|
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 | Supabase 관리자 클라이언트 |
| `REVALIDATE_SECRET` | 서버 | 웹훅 revalidation 시크릿 |
| `KAKAO_CHAT_PASSWORD` | 서버 | 카카오톡 채팅방 비밀번호 |
| `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 클라이언트 | Supabase 공개 키 |
| `NEXT_PUBLIC_ENABLE_DEV_MODE` | 클라이언트 | 개발 모드 활성화 (이메일 로그인 등) |
| `VAPID_PRIVATE_KEY` | 서버 | 웹 푸시 발송 비밀키 (절대 노출 금지) |
| `VAPID_SUBJECT` | 서버 | 웹 푸시 운영자 연락처 (`mailto:` 또는 `https://`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 클라이언트 | 웹 푸시 구독 발급용 공개키 |

> 웹 푸시: `push_sub_rel` 테이블(구독 정보) + `public/sw.js`(수신). 발송은 `insertNoti()`(`lib/notifications/insert-noti.ts`)가 인앱 알림 INSERT 직후 `sendPushToMember`를 fire-and-forget 호출 → 모든 알림 타입 자동 푸시. 설계·함정은 `.claude/docs/push-notification-design.md` / `KNOWLEDGE.md`. VAPID 키는 dev/prd 분리.

# 에이전트 구성

## 서브에이전트 목록

| 에이전트 | 파일 | 역할 |
|----------|------|------|
| 테크리드 | `.claude/agents/team-lead.md` | 아키텍처, 코드 리뷰, 작업 분배, 품질 관리 |
| 프론트엔드 개발자 | `.claude/agents/frontend-developer.md` | 페이지/컴포넌트 UI, 상태 관리, 데이터 패칭 |
| 백엔드 개발자 | `.claude/agents/backend-developer.md` | DB/API/인증/RLS/서버 액션 |
| DevOps 엔지니어 | `.claude/agents/devops-engineer.md` | CI/CD, Vercel 배포, Supabase 인프라 |

## 작업 분배 원칙

- 페이지/컴포넌트 UI, 스타일링, 반응형 → **프론트엔드 개발자**
- API/DB/인증/RLS/서버 액션 → **백엔드 개발자**
- 배포/CI·CD/인프라/환경변수 → **DevOps 엔지니어**
- 퍼블리싱/UI·UX 디자인/비주얼 QA → `ui-ux-pro-max` 스킬
- QA/테스트/검증 → `chrome-devtools` MCP 활용

## 스킬

| 스킬 | 경로 | 용도 |
|------|------|------|
| PR 생성 | `.claude/skills/pr/` | feature → dev PR 생성 (이슈 연동, AS-IS/TO-BE) |
| Next.js 베스트 프랙티스 | `.claude/skills/next-best-practices/` | Next.js 코딩 패턴 가이드 |
| Supabase Postgres | `.claude/skills/supabase-postgres-best-practices/` | DB 성능 최적화 가이드 |
| Vercel React | `.claude/skills/vercel-react-best-practices/` | React/Next.js 성능 패턴 |

## 커스텀 커맨드

- `/pr` — PR 생성 시 반드시 이 스킬을 사용할 것

## MCP 서버

`.mcp.json`(Claude Code)과 `.cursor/mcp.json`(Cursor)은 동일한 설정을 공유한다. 변경 시 반드시 양쪽 동기화.

| MCP 서버 | 용도 |
|----------|------|
| `supabase-gigang-dev` | Supabase 개발 환경 |
| `supabase-gigang-prd` | Supabase 프로덕션 환경 |
| `supabase-gigang-local` | Supabase 로컬 개발 환경 |
| `vercel` | Vercel 배포 관리 |
| `chrome-devtools` | 브라우저 테스트/QA |
| `shadcn` | shadcn/ui 컴포넌트 검색 |

## 에이전트/스킬/MCP 동기화 규칙

- `.skillshare/skills`를 이 저장소의 스킬 source of truth로 사용한다.
- 스킬을 추가하거나 수정한 후 `skillshare sync`를 실행하면 `.claude/skills`와 `.agents/skills`에 자동 동기화된다.
- Codex 프로젝트 설정 파일은 `.agents`가 아니라 `.codex/config.toml`에 둔다.
- MCP 서버를 추가하거나 변경하면 `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`을 함께 갱신한다.
- Cursor는 Codex의 `.agents/skills`나 `.codex/config.toml`을 직접 읽지 않으므로, Cursor 전용 설정은 `.cursor/*`에서 별도로 관리한다.

## 참고 문서

- `DESIGN.md` — 디자인 시스템 (토큰, 컴포넌트 카탈로그, AI 규칙)
- `.claude/docs/coding-standards.md` — 코딩 컨벤션, 보안, JSDoc, Git 규칙
- `.claude/docs/component-conventions.md` — 컴포넌트 작성 규칙, shadcn/ui 사용법
