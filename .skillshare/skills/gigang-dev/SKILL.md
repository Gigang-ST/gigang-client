---
name: gigang-dev
description: "기강 프로젝트 통합 개발 스킬. 개발·문서개선·다관점리뷰·스킬자기개선을 매 실행마다 수행. 사용자가 개발 요청, 버그 수정, 기능 추가, 코드 리뷰, 리팩토링, 전체 리뉴얼 등 어떤 개발 관련 요청을 해도 이 스킬이 라우팅·실행·검증·문서갱신까지 처리."
---

# gigang-dev — 개발 + 문서 + 리뷰 + 자기개선 통합 스킬

> 쓸수록 문서와 스킬 자체가 진화하는 자기개선(self-improving) 워크플로우.

---

## 발동 조건

기강 프로젝트에서 **모든 개발 관련 요청**에 발동.

| 신호 | 예시 |
|------|------|
| 개발 요청 | "이 기능 추가해줘", "버그 수정", "화면 바꿔줘" |
| 코드 리뷰 | "코드 봐줘", "리뷰해줘", "이거 괜찮아?" |
| 문서 개선 | "문서 정리해줘", "AGENTS.md 갱신" |
| 리팩토링 | "정리 좀 해줘", "코드 개선", "기술 부채" |
| 전체 리뉴얼 | "Toss 같은 느낌으로", "한번에 다 반영" |
| 막연한 기획 | "어떻게 만들까", "방향 잡아줘", 명세 없이 던진 큰 덩어리 |
| 스킬 개선 | "스킬 업그레이드", "gigang-dev 개선" |

---

## 핵심 원칙

1. **매 실행마다 문서와 스킬이 개선된다.** 개발만 하고 끝내지 않는다. 필수 후처리(Phase F)가 반드시 실행.
2. **구현 전에 검색.** WebSearch로 "지금 시점의 정답"을 먼저 확인.
3. **다관점 리뷰는 서비스 관점.** 크루원·관리자 + 엔지니어·디자이너·보안 = 기술과 서비스 양쪽.
4. **서브에이전트는 역할에 맞는 모델.** 비용·속도·품질 균형.
5. **git 흐름 존중.** feature/* → dev(squash merge) → main. atomic commit, 파괴적 작업 전 확인.
6. **AGENTS.md, DESIGN.md가 SSOT.** 코딩 패턴은 `.claude/docs/coding-standards.md`, 컴포넌트 규약은 `.claude/docs/component-conventions.md`.

---

## 서브에이전트 모델 선정 가이드

| 역할 | 모델 | 이유 |
|------|------|------|
| **린트·규칙 검사** (Next.js rules, TS 위생) | `haiku` | 규칙 기반, 빠르고 저렴 |
| **코드 리뷰** (단일 파일·관점) | `sonnet` | 코드 이해력 충분, 속도 우수 |
| **탐색·검색 종합** (코드베이스 맵, 패턴 탐색) | `sonnet` | 넓은 컨텍스트 처리 |
| **아키텍처 결정** (DB 설계, RLS, 라우트 구조) | `opus` | 깊은 추론 필요 |
| **제품 전략** (기능 스코프, 우선순위 판단) | `opus` | 비즈니스 판단력 |
| **다관점 종합 판단** (P0 판정, 라운드 종료 판단) | `opus` | 여러 관점 교차 추론 |

---

## Phase 구조

모든 실행은 아래 Phase를 따른다. 작업 규모에 따라 Phase를 건너뛰되, **Phase F(필수 후처리)는 절대 생략 불가**.

```
Phase A: 라우팅 (규모 판단)
  ↓
Phase B: 탐색 + 검색 (컨텍스트 확보)
  ↓
Phase C: 실행 (개발 · 리뷰 · 리팩토링)
  ↓
Phase D: 검증 (다관점 리뷰)
  ↓
Phase E: 보고
  ↓
Phase F: 필수 후처리 (문서개선 + 스킬개선) ← 절대 생략 불가
```

---

### Phase A: 라우팅 — 규모 판단

| 트랙 | 기준 | Phase D |
|------|------|---------|
| **T1: 즉시 실행** | 버그·단일 UI·데이터 수정 (30분↓) | 생략 가능 (변경 <3파일) |
| **T2: 마이크로 라운드** | 기능 1개·흐름 변경·DB 변경 (1-3시간) | 관련 관점 1-2종 |
| **T3: 풀 라운드** | 3개+ 묶음·전체 개편 (4-8시간) | D1 2종 + D2 4종 병렬 |
| **T4: 리뷰 전용** | 코드 리뷰·보안 감사 | 요청된 관점만 |
| **T5: 문서/스킬 전용** | 문서 정리·스킬 업그레이드 | 생략 |
| **T6: 기획 라운드** | 명세 없음·"어떻게 만들까"·막연한 플랜 | T2/T3 합류 후 |

> **T6 우선 신호:** "알아서/방향/기획"이 있으면 규모 무관하게 T6 먼저. 플랜 확정 후 T2/T3 실행으로 합류.

#### T6: 기획 라운드 흐름

| 단계 | 도구 | 언제 |
|------|------|------|
| 1. 의도 추출 | `superpowers:brainstorming` 또는 `/office-hours` | 방향이 안 잡힘 |
| 2. 자동 검토+결정 | `/autoplan` | 플랜 초안이 있고 "알아서 결정까지" 원할 때 |
| 3. 실행 합류 | T2/T3 | 플랜 확정 후 |

---

### Phase B: 탐색 + 검색

#### B1. 코드베이스 탐색

T3(풀 라운드)일 때만 `Explore` 서브에이전트 전체 맵. 그 외는 해당 파일/디렉토리만 최소 탐색.

탐색 항목 (T3):
- 라우트 ↔ Link/redirect/router.push href 매핑
- 도메인별 쿼리/액션 위치 (`lib/queries/`, `app/actions/`)
- getCurrentMember() 호출 패턴 및 리다이렉트 흐름
- dead code 후보

#### B2. WebSearch — 최신·최적 방향 탐색

**T2+ 매 실행마다 최소 1회.** 검색 목적:
- 현재 기술 스택 최신 best practice
- 한국 러닝/스포츠 앱 UX 패턴
- 보안 취약점 공지

```
기술: "Next.js 16 app router best practice 2026"
      "Supabase RLS pattern 2026"
      "React 19 server component pitfalls"
디자인: "Korean running app UX 2026"
        "Toss design system 2026"
보안:   "Supabase security advisory 2026"
        "Next.js middleware security"
```

검색 결과 중 **현재 코드에 영향 있는 것만** 반영.

---

### Phase C: 실행

**T1**: 바로 코드 변경. `pnpm run lint` + `pnpm run build` (타입 에러) 확인.

**T2**:
1. 코드 변경
2. `pnpm run lint` + 타입 체크
3. Next.js rules 검사 (변경 파일 대상, `haiku` 서브에이전트 병렬)

**T3**: 아래 풀 라운드 9단계.

#### 풀 라운드 상세 (T3)

| 단계 | 내용 | 주도 |
|------|------|------|
| 1 | SSOT 문서 세트 검토 (AGENTS.md·DESIGN.md·coding-standards.md) | 엔지니어·디자이너 |
| 2 | 디자인 토큰 + globals.css | 디자이너 |
| 3 | AppShell + 공통 컴포넌트 (`components/common/`) | 엔지니어 |
| 4 | 도메인 컴포넌트 (`components/races/`, `components/records/` 등) | 디자이너+엔지니어 |
| 5 | 페이지 재설계 | 디자이너+엔지니어 |
| 6 | 다관점 병렬 QA (Phase D) | 호출자 |
| 7 | 관리자 영역 (`/admin`) | 엔지니어 |
| 8 | DB 마이그레이션 + RLS 검토 | 엔지니어·보안 |
| 9 | 모바일 레이아웃 검증 | 디자이너 |

---

### Phase D: 검증 — 다관점 리뷰

#### D1. 서비스 관점 리뷰

페르소나 정의는 **[personas.md](personas.md)** 참조 (on-demand 로드).

| 페르소나 | 모델 | 관점 |
|----------|------|------|
| **크루원(멤버)** | `sonnet` | 대회 신청·기록 조회·랭킹이 직관적인가? |
| **관리자** | `sonnet` | 멤버 관리·공지·회비 처리가 효율적이고 안전한가? |

T1: 생략 가능 / T2: 1종만 / T3: 2종 병렬

#### D2. 기술 관점 리뷰

| 페르소나 | 모델 | 소유 SSOT |
|----------|------|-----------|
| **디자이너** (Toss/Pretendard 미감) | `sonnet` | DESIGN.md |
| **엔지니어** (Next.js 16 + Supabase) | `sonnet` | coding-standards.md, AGENTS.md |
| **접근성** (모바일 터치 + WCAG 2.2 AA) | `sonnet` | DESIGN.md |
| **보안** (RLS + 시크릿 + 서버 액션) | `sonnet` | coding-standards.md |

T2: 해당 관점 1-2종만 / T3: 4종 병렬

#### D3. Next.js rules 검사 (자동)

변경된 `.ts`/`.tsx` 파일마다 `haiku` 서브에이전트 병렬 디스패치:
- Server Actions: `"use server"` 파일에서 async function만 export
- Client Components: 브라우저 API 사용 시 `"use client"` 필수
- 환경변수: `process.env` 직접 접근 금지 → `lib/env.ts` import
- 날짜/시간: `new Date()` 금지 → `lib/dayjs.ts` import
- 멤버 조회: `getCurrentMember()` 사용, Context/Provider 패턴 금지

#### D4. 재검증 게이트 (T3만)

P0 fix 적용 후 해당 페르소나만 1회 재호출. **같은 페르소나 3회째 = 함정 신호** → 라운드 중단, 사용자 보고.

---

### Phase E: 보고

- **T1**: 변경 요약 1-3줄.
- **T2**: 변경 항목 + 의사결정 사항(있으면).
- **T3**: 핵심 변경 N개 → 의사결정 표(5개 이내) → 다음 할 일.
- **T4**: 리뷰 결과 요약 + P0 항목 하이라이트.

---

### Phase F: 필수 후처리 — 문서개선 + 스킬개선

> **이 Phase는 모든 트랙에서 절대 생략 불가.**

#### F1. AGENTS.md 개선

- 새 라우트 추가 시 라우트 구조 갱신
- 새 환경변수 추가 시 환경변수 테이블 갱신
- 새 서브에이전트/스킬/MCP 추가 시 해당 섹션 갱신
- **핵심 원칙·패턴 변경 시 반드시 갱신** — AGENTS.md 는 매 세션 봐야 할 사실만.

#### F2. DESIGN.md 개선 (UI 변경 시)

- 토큰 변경 반영
- 새 공통 컴포넌트 규약 추가 (props·용도·예시)
- 삭제된 토큰/컴포넌트 제거
- AI 규칙 섹션 갱신

#### F3. coding-standards.md / component-conventions.md 개선

- 새 패턴·함정 추가
- 기존 규칙에서 바뀐 것 교체
- DB 관련 패턴 변경 시 coding-standards.md Supabase 섹션 갱신

#### F4. KNOWLEDGE.md 개선 (`.claude/docs/KNOWLEDGE.md`)

파일이 없으면 새로 만든다.

- 이번 작업에서 발견한 함정·예상 못한 동작·재사용 패턴 추가
- 해결된 함정은 "해결됨" 표시 (삭제 안 함)
- 기존 항목과 겹치면 병합

#### F5. 문서 구조 점검 — 비대해진 문서 쪼개기

**필수 자가검사 (매 실행 끝에 1회):**

```powershell
(Get-Content AGENTS.md).Count
(Get-Content .skillshare/skills/gigang-dev/SKILL.md).Count
```

- **AGENTS.md > 200줄** → 대형 섹션을 `.claude/docs/` 별도 파일 + `@파일명` 포인터로 분리
- **SKILL.md > 500줄** → supporting file(personas/evolution-log 등)로 분리 후 SKILL.md 엔 포인터만
- 통과 시 "문서 길이 OK (AGENTS NNN / gigang-dev NNN)" 한 줄 보고하고 넘어간다.

#### F6. 이 SKILL.md 자체 개선

**매 실행 후 반드시 자기 점검** — 해당하면 직접 수정: 잘 작동한 단계 보강 · 불필요한 단계 조건부/제거 · 새 패턴 추가 · 모델 오선정은 가이드 테이블 갱신 · 라우팅 오판은 Phase A 갱신.

개선 로그는 **[evolution-log.md](evolution-log.md)** 에 append (on-demand 로드). 새 항목은 표 **맨 위**에 추가, 12개 초과 시 오래된 것부터 요약.

---

## 페르소나 풀

> Phase D 리뷰어 정의는 **[personas.md](personas.md)** 참조 (on-demand 로드).
> - **기술 4종**: 디자이너·엔지니어·접근성·보안
> - **서비스 2종**: 크루원(멤버)·관리자
> - **ad-hoc**: 좁고 깊은 피드백에 1회용 정의 → 재사용성 있으면 표준으로 승격

---

## 장기 리팩토링 발견 루프

개발 중 아래 신호를 감지하면 KNOWLEDGE.md P2/P3에 기록:

| 신호 | 행동 |
|------|------|
| 같은 쿼리 패턴이 3곳+ 중복 | lib/queries/ 추상화 후보 기록 |
| 500줄+ 파일 | 분리 후보 기록 |
| any 타입 사용 | 타입 강화 후보 기록 |
| N+1 쿼리 의심 | 성능 개선 후보 기록 |
| RLS 누락 의심 | 보안 개선 후보 기록 |
| `new Date()` 직접 사용 | lib/dayjs 교체 후보 기록 |

---

## 첫 실행 시

1. `AGENTS.md`, `DESIGN.md`, `.claude/docs/coding-standards.md` 현재 상태 읽기
2. 사용자 요청 분류 (Phase A)
3. Phase B부터 순서대로 진행
4. **Phase F 후처리 완료 확인 후에만 종료**

---

## 자기 참조

> 스킬 진화 이력은 **[evolution-log.md](evolution-log.md)** 에 분리 보관.
