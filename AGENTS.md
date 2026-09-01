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
- **날짜/시간**: `import { dayjs } from "@/lib/dayjs"` 만 사용(직접 import·`new Date()` 금지). 포맷팅에 `.slice()`/`.replace()` 문자열 조작 금지.
  **사용자에게 보이는 날짜·집계는 항상 KST.** 배포처가 UTC라 KST 00~09시에 서버·브라우저의 "오늘"이 갈린다. 경계는 *표시냐 계산이냐*가 아니라 **"날짜" 개념이 끼느냐**다:
  - "지금/오늘" 판정 → `nowKST()` · `todayKST()` · `todayStartKST()`
  - 날짜 차이(D-day·N일 전) → **양쪽 다** KST로. 상대편 date 문자열은 `parseEventTime()`
  - **timestamptz(`_at`) 표시** → `formatKST(value, fmt)`. `dayjs(val).format()`은 로컬로 찍혀 하루 밀린다
  - date 컬럼(`_dt`) 표시, 절대시각 차이(`diff(x,"minute")`), `toISOString()` 저장 → 그대로 안전
  - ESLint(`no-restricted-syntax`)가 위험한 형태를 막는다 — 회귀 테스트는 `lib/__tests__/kst-boundary.test.ts`
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
| `NAVER_SITE_VERIFICATION` | 서버 | 네이버 서치어드바이저 소유확인 코드 (미설정이면 메타태그 미출력) |

> 웹 푸시: `push_sub_rel` 테이블(구독 정보) + `public/sw.js`(수신). 발송은 `insertNoti()`(`lib/notifications/insert-noti.ts`)가 인앱 알림 INSERT 직후 `sendPushToMember`를 fire-and-forget 호출 → 모든 알림 타입 자동 푸시. 설계·함정은 `.claude/docs/push-notification-design.md` / `KNOWLEDGE.md`. VAPID 키는 dev/prd 분리.

> 기강 포인트: `pt_txn_hist` 원장에 원천 테이블(모임·대회·마일리지런·정보) **DB 트리거**가 자동 적립. 앱 코드에 훅 없음 — 새 쓰기 경로를 추가해도 적립은 자동으로 따라온다. 룰·트리거 매트릭스: `docs/design/2026-07-04-기강포인트제도.md`.
> **노출 범위(2026-07-29 부분 해제)**: 총 획득 포인트는 **본인 프로필탭에서만** 숫자로 보인다(최근활동 헤더 우측 `N P` + HelpTip). 그 밖은 여전히 히든이다 — 남의 프로필 카드, 랭킹, 전광판에는 절대 노출하지 않고(공개되면 사실상 공개 랭킹이 된다) **적립 규칙·배점도 화면에 적지 않는다**(HelpTip은 "모임 참석·대회 출전·기록 등록으로 쌓여요" 한 줄까지). 전광판 활동량 랭킹은 계속 "활동량"으로 부른다.

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

## 스킬 — 저장소에 담지 않는다

**스킬은 각자 로컬에서 돌린다.** 저장소는 스킬 파일을 갖지 않으며(`.claude/skills/`·`.agents/`·
`.skillshare/` 는 전부 gitignore), 어떤 스킬을 쓸지는 쓰는 사람이 자기 머신에서 정한다.

예전엔 `.skillshare/skills` 를 정본으로 커밋하고 `skillshare sync` 로 미러링했는데, 정본이
갈라진 채 굴러(한쪽은 ignore, 한쪽은 추적, 이름도 달랐다) 어느 게 진짜인지 알 수 없었다.
저장소가 들고 있어야 할 것은 **코드와 이 문서들**이고, 도구는 사람 쪽에 둔다.

- 이 문서(AGENTS.md)·`CLAUDE.md`·`DESIGN.md`·`.claude/docs/` 는 계속 저장소 정본이다 —
  스킬이 아니라 **프로젝트 규약**이라서, 누가 어떤 도구로 작업하든 같은 것을 봐야 한다.
- `.claude/agents/` 서브에이전트 정의도 저장소에 남는다(위 표 참조).
- 로컬 스킬이 저장소 규약과 어긋나면 **이 문서가 이긴다.**

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

## MCP 설정 동기화 규칙

- MCP 서버를 추가하거나 변경하면 `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`을 함께 갱신한다.
- Codex 프로젝트 설정 파일은 `.agents`가 아니라 `.codex/config.toml`에 둔다.
- Cursor는 Codex의 `.codex/config.toml`을 직접 읽지 않으므로, Cursor 전용 설정은 `.cursor/*`에서 별도로 관리한다.
- 스킬 동기화 규칙(`skillshare sync`)은 없어졌다 — §스킬 참조.

## 참고 문서

- `DESIGN.md` — 디자인 시스템 (토큰, 컴포넌트 카탈로그, AI 규칙)
- `.claude/docs/coding-standards.md` — 코딩 컨벤션, 보안, JSDoc, Git 규칙
- `.claude/docs/component-conventions.md` — 컴포넌트 작성 규칙, shadcn/ui 사용법
- `app/api/mcp/README.md` — **우리가 제공하는** 운영 MCP(`gigang-ops`) 연결·도구·권한 가이드. 설계 정본은 `docs/superpowers/specs/2026-07-24-gigang-ops-mcp-design.md`

> ⚠️ **운영 MCP에 도구를 추가할 때 `app/actions/**` 의 서버 액션을 그대로 부를 수 없다.**
> 액션은 `withMember`/`withActive` → `getCurrentMember()` → **Supabase 세션 쿠키**에 묶여 있는데
> MCP 요청은 `Authorization: Bearer <PAT>` 만 들고 온다(팀도 Host 파싱이 아니라 토큰 컨텍스트에서 온다).
> 도메인 로직은 `lib/` 의 **클라이언트 주입식 코어**로 빼서 액션·MCP가 공유하고
> (예: `lib/mileage-run.ts`), 각 경로는 신원 해석과 `next/*` 부수효과만 맡는다.
> 검증 스키마(`lib/validations/*`)는 반드시 앱과 같은 것을 쓴다.
