<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

## Reference

- [Next.js Evals](https://nextjs.org/evals) — 번들 문서 + AGENTS.md가 실제 에이전트 성능에 미치는 벤치마크 결과

<!-- END:nextjs-agent-rules -->

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
