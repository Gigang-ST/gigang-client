# 애플리케이션 v2 전환 계획 (dev·prd 공통)

레거시 테이블(`member`, `competition`, `competition_registration`, `race_result`, `personal_best`, `utmb_profile`) 의존 코드를 v2 스키마(`mem_mst`, `mem_utmb_prf`, `comp_mst`, `comp_reg_rel`, `rec_race_hist` 등)로 옮길 때의 **슬라이스 순서·인벤토리·검증·운영 절차**를 정리한다.

| 참고 문서 | 용도 |
|-----------|------|
| `database-schema-v2-migration-map.md` | 컬럼·FK·검증 SQL |
| `database-schema-v2-rollout-progress.md` | **prd DDL 완성본 §2.1**(`migrations/*.sql` 전체·이름 순) · DB 백필·§6.5·§7 (§5.5·§10은 dev 히스토리) |
| `database-schema-v2-cutover-checklist.md` | prd 컷오버·백업·RLS·§8 시행착오 방지 |
| `database-schema-v2-member-domain.md` | 회원·팀·관리자 필드 매핑 |

---

## 1. 원칙 (dev와 prd 동일)

1. **한 번에 전부 교체하지 않는다.** 도메인 슬라이스 단위로 나누고, 슬라이스마다 **인벤토리 → 쿼리 교체 → 스모크 → PR** 을 반복한다.
2. **prd도 dev와 같은 순서·같은 슬라이스 경계를 쓴다.** 차이는 **DB 컷오버 창구·백업·마이그레이션 적용 시점**뿐이다. **prd DB 스키마**는 `rollout-progress` **§2.1**에 정의된 대로, 고정한 Git 리비전의 **`supabase/migrations/*.sql` 전체를 파일명 순**으로 적용한 것이 완성본이다(연혁 표를 따라 읽을 필요 없음).
3. **교차 화면은 슬라이스 완료 후 통합 스모크한다.** 홈·대회 목록 등은 여러 테이블을 한 번에 쓰므로, 각 슬라이스가 끝난 뒤 해당 플로우를 다시 본다.
4. **타입 정합:** 슬라이스 진행 중 `pnpm exec supabase gen types` 로 `lib/supabase/database.types.ts` 를 v2 반영 상태로 맞춘다(로컬은 `supabase link` dev 기준).
5. **롤백:** 슬라이스별 브랜치·PR을 유지하고, 문제 시 해당 PR만 revert 하거나 환경변수 플래그(선택)로 v1 쿼리 경로를 잠시 되살린다.

---

## 2. 슬라이스 정의 및 v2 대응 테이블

| 슬라이스 | v1(대표) | v2(대표) | 비고 |
|----------|-----------|-----------|------|
| **0 준비** | — | 타입·문서 | `database.types` 재생성, 매핑표 확인 |
| **1 회원·인증·관리자** | `member` | `mem_mst`, `team_mem_rel` | `admin`·`status` 등은 `migration-map`·`member-domain` 과 일치시킬 것 |
| **2 대회** | `competition` | `comp_mst`, `comp_evt_cfg` | 종목·날짜 컬럼명 변경 |
| **3 참가** | `competition_registration` | `comp_reg_rel`, `team_comp_plan_rel` | `comp_reg_id`·`comp_evt_id` 조인. `team_comp_plan_rel`은 참가 신청 시 없으면 생성(카탈로그만 등록 시에는 행 없음). 기록 저장과는 무관(`domains` §2·§3). |
| **4 기록** | `race_result` | `rec_race_hist` | B-2/B-3·UK 중복 스크립트: `scripts/sql/v2_p7_race_result_uk_duplicate_list.sql` |
| **5 부가** | `personal_best`, ~~`utmb_profile`~~ | `mem_utmb_prf`(UTMB), PB는 파생·별도 | **UTMB:** DB `20260404165809_v2_mem_utmb_prf.sql`(P9) + `20260406190000_v2_mem_utmb_prf_add_recent_race_cols.sql`로 `rct_race_nm`·`rct_race_rec`까지 반영. **PB:** 홈 등 `personal_best` 잔존 — 제품·슬라이스 범위 별도 확정 |

### 2.1 현재 앱 전환 상태 (기준일 갱신)

**원칙:** 슬라이스 번호는 유지하고, **1 → 2 → 3 → 4** 순으로 앱 쿼리를 바꾼다. (UTMB만 DB·앱이 앞서 맞춰 둔 예외.)

| 슬라이스 | 앱(이 저장소) | 비고 |
|----------|----------------|------|
| 0 | 필요 시 `supabase gen types` | v2 테이블은 수동 보강·재생성 병행 가능 |
| 1 | **앱 전환 완료** | 조회·온보딩·프로필·관리자: `mem_mst` + 기강 `team_mem_rel`. 레거시 `member`는 FK 호환용 **이중 기록**(온보딩·프로필 저장 시). DB: `20260406120000_mem_mst_rls_oauth_and_teammates.sql` + **`20260407120000_v2_team_mem_rel_rls_no_recursion.sql`**(RLS 42P17 재귀 제거, prd도 동일 순서 적용) |
| 2 | 미완 | `competition` → `comp_mst`·`comp_evt_cfg` |
| 3 | 미완 | `competition_registration` → `comp_reg_rel` 등 |
| 4 | 미완 | `race_result` → `rec_race_hist` (`records`·`profile`·관리자 기록 화면 등) |
| 5 | 진행 예정 | `utmb_profile`은 최근 대회 컬럼까지 반영됨(`recent_race_name`, `recent_race_record`). v2 `mem_utmb_prf`도 `rct_race_nm`, `rct_race_rec` 컬럼 반영 완료(마이그레이션 적용 필요) |

---

## 3. 코드 인벤토리 (파일 → 주로 쓰는 v1 테이블)

아래는 **현재 저장소 기준** `from("…")` 검색 결과이다. 작업 시작 전에 한 번 `rg 'from\\(\"(member|competition|…)'` 로 갱신한다.

### 슬라이스 1 — 회원·관리자

| 경로 | 용도 |
|------|------|
| `lib/queries/member.ts` | `getCurrentMember`, `verifyAdmin` → `member` |
| `lib/get-member.ts` | `getMember` → `member` |
| `components/member-provider-server.tsx` | `getMember` 사용 |
| `contexts/member-context.tsx` | `Member` 타입 (get-member) |
| `components/auth/member-onboarding-form.tsx` | `member` insert/update |
| `components/profile/profile-edit-form.tsx` | `member` update |
| `components/profile/bank-info-form.tsx` | `member` update |
| `app/actions/upload-avatar.ts` | `member` update |
| `app/actions/admin/manage-member.ts` | `member` 관리자 CUD |
| `app/(info)/admin/members/page.tsx` | `member` 목록 |
| `app/(info)/admin/approvals/page.tsx` | `member` (승인 흐름) |

### 슬라이스 2 — 대회

| 경로 | 용도 |
|------|------|
| `app/actions/create-competition.ts` | `competition` insert |
| `app/actions/search-competitions.ts` | `competition` 조회 |
| `app/actions/get-past-gigang-competitions.ts` | `competition` + `competition_registration!inner` |
| `app/actions/admin/manage-competition.ts` | `competition` CUD (일부는 슬라이스 3과 인접) |
| `app/(main)/races/page.tsx` | `competition` + registration 조인 |
| `app/(info)/admin/competitions/page.tsx` | `competition` + registration count |
| `components/races/race-list-view.tsx` | `competition`, `competition_registration`, `member` |
| `components/races/competition-detail-dialog.tsx` | `competition_registration`, `competition` update |
| `components/profile/race-record-dialog.tsx` | `competition` select (참가 연계) |
| `app/(main)/page.tsx` | `competition` 다수·기강대회 집계 (슬라이스 2·3·5와 교차) |

### 슬라이스 3 — 참가

| 경로 | 용도 |
|------|------|
| `components/home/upcoming-races.tsx` | `competition_registration` |
| `components/races/race-list-view.tsx` | `competition_registration` |
| `components/races/competition-detail-dialog.tsx` | `competition_registration` |
| `components/profile/race-record-dialog.tsx` | `competition_registration` |
| `app/(main)/page.tsx` | `competition_registration` (기강대회 참가자 수 등) |
| `app/actions/admin/manage-competition.ts` | `competition_registration` |

### 슬라이스 4 — 기록

| 경로 | 용도 |
|------|------|
| `components/profile/race-record-dialog.tsx` | `race_result` |
| `components/profile/race-history-dialog.tsx` | `race_result` |
| `app/(main)/records/page.tsx` | `race_result` |
| `app/(main)/profile/page.tsx` | `race_result` |
| `app/actions/admin/manage-record.ts` | `race_result` |
| `app/(info)/admin/records/page.tsx` | `race_result` |
| `app/actions/admin/get-admin-stats.ts` | `race_result` count |

### 슬라이스 5 — 부가(UTMB 재정의 / PB·복합 잔여)

**UTMB — 기준 (`mem_utmb_prf`)**

| 경로 | 상태 | 비고 |
|------|------|------|
| `components/profile/personal-best-grid.tsx` | 레거시 사용 | `utmb_profile` upsert·delete, 최근 대회(`recent_race_*`) 저장 |
| `app/(main)/profile/page.tsx` | 레거시 사용 | UTMB: `utmb_profile` 조회(최근 대회 포함). 마라톤 PB 카드용 데이터는 `race_result`(슬라이스 4) |
| `app/(main)/records/page.tsx` | 레거시 사용 | 트레일 구간: `utmb_profile` + `member` 조인. 최근 대회는 DB 저장값 사용 |

**`mem_utmb_prf` 점검 기준 (앱 로직 점검 반영)**

- 현재 `mem_utmb_prf`는 회원 1:1 확장으로 팀 컨텍스트(`team_id`)를 포함하지 않는다.
- `recent_race_*`는 v2에서 `rct_race_nm`, `rct_race_rec`로 저장한다.

**PB·홈 — 미완 (`personal_best` + 레거시 조인)**

| 경로 | 용도 |
|------|------|
| `app/(main)/page.tsx` | `personal_best` + `member` join |

### 기타·복합

| 경로 | 비고 |
|------|------|
| `app/(main)/page.tsx` | 슬라이스 1·2·3·4·5(PB) 교차 — **각 슬라이스 완료 후 홈 통합 스모크** |
| `lib/supabase/database.types.ts` | v2 적용 후 재생성·컴파일 오류로 누락 필드 검증 |

---

## 4. 슬라이스별 권장 절차 (매 슬라이스 동일)

1. **인벤토리 확인:** §3 표 + `rg` 로 추가 파일 없는지 확인.
2. **매핑 메모:** PR 본문 또는 이슈에 “v1 컬럼 → v2 컬럼” 한 블록(해당 슬라이스만).
3. **구현:** 가능하면 `lib/queries/v2/…` 등 한 레이어에 모아 UI는 시그니처 유지.
4. **로컬 검증:** `pnpm run build` / `pnpm run lint` / 해당 라우트 수동 스모크.
5. **게이트:** `database-schema-v2-migration-map.md` §5.2 중 슬라이스와 맞는 항목 실행(이미 DB에서 통과한 것은 스크린샷·건수만 PR에 첨부).

### 유스케이스 예시 (스모크 시 체크)

- **U1:** 비로그인 — 대회 목록·기록 공개 구간 조회.
- **U2:** 로그인·가입 완료 — 프로필 조회/수정, 온보딩 없음.
- **U3:** 로그인·미가입 — 온보딩 제출 후 `mem_mst` 반영.
- **U4:** 참가 신청·취소 — `comp_reg_rel` 정합.
- **U5:** 기록 추가·수정·삭제 — `rec_race_hist`·RLS.
- **U6:** 관리자 — 대회/멤버/기록 관리 액션.

---

## 5. prd(운영계)에서 달라지는 것만

앱 코드 절차는 **dev와 동일**하다. 아래는 **배포·DB 쪽**만 추가로 맞춘다.

| 항목 | 내용 |
|------|------|
| DB | `rollout-progress` · `cutover-checklist` 에 따라 **동일 마이그레이션 세트**·백필·(선택) §6.5 `archive.old_*` |
| 백업 | prd 스냅샷 후 백필·앱 릴리즈 |
| 검증 | `migration-map` §5.2 재실행, B-2/B-3·샘플 id |
| 타입 | prd 프로젝트에 맞춰 types 한 번 더 생성(혼동 방지) |
| 롤백 | 앱 revert + DB는 사전 계획(체크리스트 §6) |

---

## 6. 완료 정의 (슬라이스·전체)

- **슬라이스 완료:** §3 해당 행의 모든 경로가 v2 쿼리만 사용(또는 의도적 레거시 0건)·lint/build 통과·유스케이스 스모크 기록.
- **전체 완료:** `rollout-progress.md` §7 체크 전부·v1 `from("` 참조 0건(또는 `archive.old_*` 읽기 전용 등 예외 문서화)·prd 컷오버 DoD.

---

## 7. 에이전트·플랜 사용 팁

- **슬라이스 단위로 요청:** “슬라이스 1만, `getCurrentMember`·`verifyAdmin`·`getMember` 를 `mem_mst` 기준으로 바꿔줘”처럼 범위를 고정.
- **아키텍처·순서 논쟁이 필요하면** 짧은 Plan으로 슬라이스 순서만 고정한 뒤, 구현은 슬라이스별 Agent 가 적합.

### 팀 컨텍스트 (앱)

- **현재:** `team_id`는 **요청 Host → `team_cd` → `team_mst`** 로 해석한다(`lib/queries/request-team.ts`). `getCurrentMember`·`verifyAdmin`·온보딩·관리자 액션·OAuth 콜백·클라이언트는 서버에서 넘긴 `teamId` 또는 동일 Host 규칙을 따른다. 폴백 UUID는 **`lib/constants/gigang-team.ts`의 `DEFAULT_FALLBACK_TEAM_ID` 한 곳**이며, P0/P2 백필의 `team_cd = gigang` 정본과 동일하다.
- **추후:** 사용자 **팀 선택 UI**·**한 계정 다중 팀**이 필요하면 활성 `team_id` 소스(Host만이 아닌 세션·JWT·경로 등)를 확장하고, `getRequestTeamContext`/`resolveTeamContextFromHost`를 그에 맞게 조정한다. 상세는 `database-schema-v2-member-domain.md` §7.

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-05 | 초안: 슬라이스·인벤토리·dev/prd 공통 절차 |
| 2026-04-06 | UTMB: `mem_utmb_prf` 앱 반영·P9(`20260404165809`) 문서 연계. §2.1 진행 상태·슬라이스 5 인벤토리 분리(UTMB 완료 / PB 미완). 앱 전환은 슬라이스 1→4 순 권장 명시 |
| 2026-04-06 | 슬라이스 1 앱: `mem_mst`·`team_mem_rel` 조회·온보딩(서버 액션)·프로필·관리자·RLS(`20260406120000`). `member` 이중 기록 유지 |
| 2026-04-07 | 슬라이스 1 DB: `20260407120000_v2_team_mem_rel_rls_no_recursion.sql` — `team_mem_rel`/`team_mst`/`mem_mst_select_same_team` RLS 무한 재귀(42P17) 제거. `rollout-progress` 웨이브 2a·`cutover-checklist` §8에 prd 필수 포함 명시 |
| 2026-04-07 | prd 담당자용: `rollout-progress` **§2.1** 완성본 정의·참고 표(§1·원칙 2) 교차 참조 — 히스토리와 절차서 분리 |
| 2026-04-06 | §7: 팀 컨텍스트 TODO 정리(당시 `GIGANG_TEAM_ID` 전역 참조 전제) |
| 2026-04-07 | §7: Host 기반 `getRequestTeamContext`·`DEFAULT_FALLBACK_TEAM_ID` 반영. `member-domain` §7 동기 |
| 2026-04-06 | §9: 슬라이스별 수정 포인트·수동 테스트 목록·전체 회귀 체크리스트 추가 |

---

## 9. 슬라이스별 수정 포인트·수동 테스트 체크리스트

**쓰는 방법:** 슬라이스 작업이 끝날 때마다 해당 절의 **테스트**만 순서대로 체크. **전체 앱 전환(슬라이스 1~4·5 잔여까지) 후**에는 **§9.8** 을 한 번에 수행한다.  
**자동 검증:** 매 슬라이스 끝에 `pnpm run lint` · `pnpm run build`. DB 게이트는 `migration-map` §5.2·`rollout-progress` §5.2와 병행.

### 9.0 슬라이스 0 — 준비

| 수정/확인 | 내용 |
|-----------|------|
| 타입 | `pnpm exec supabase gen types …` 로 `lib/supabase/database.types.ts` 갱신(또는 수동 보강 후 빌드) |
| 문서 | `migration-map`·본 문서 §2·§3 인벤토리 최신화 |

**테스트**

- [ ] `pnpm run build` 성공
- [ ] `pnpm run lint` 성공(팀 정책 기준)

### 9.1 슬라이스 1 — 회원·인증·관리자 (앱 반영 완료 시점 기준)

**주로 건드린 소스(회고용)**

| 구분 | 경로 |
|------|------|
| 조회·관리자 | `lib/queries/member.ts`, `lib/queries/app-member.ts`, `lib/get-member.ts` |
| 팀 컨텍스트(Host) | `lib/queries/request-team.ts` (`getRequestTeamContext`, `resolveTeamContextFromHost`, `extractTeamCdFromHost`) |
| 폴백 팀 UUID | `lib/constants/gigang-team.ts` (`DEFAULT_FALLBACK_TEAM_ID` — 업무 코드 직참조 금지, `request-team` 폴백만) |
| 온보딩 | `app/actions/onboarding-mem-v2.ts`, `components/auth/member-onboarding-form.tsx` |
| 프로필 | `components/profile/profile-edit-form.tsx`, `bank-info-form.tsx`, `app/actions/upload-avatar.ts` |
| 관리자 | `app/actions/admin/manage-member.ts`, `get-admin-stats.ts`, `app/(info)/admin/members/page.tsx`, `approvals/page.tsx` |
| 교차 | `app/(main)/page.tsx`(활동 인원 `team_mem_rel`), `components/races/race-list-view.tsx`(멤버 상태) |
| DB | `supabase/migrations/20260406120000_mem_mst_rls_oauth_and_teammates.sql`, `20260407120000_v2_team_mem_rel_rls_no_recursion.sql` |

**남은 레거시:** `member` 테이블은 **이중 기록**으로 여전히 갱신됨(FK·기존 RLS 정책 호환).

**테스트 — 일반 회원**

- [ ] 비로그인: 홈·대회·기록 공개 화면 정상
- [ ] 로그인 + 미가입: 온보딩 진입, **신규 전화** → 상세 입력 → 가입 완료 후 홈/프로필 이동
FAIL 프로필에서 카카오로그인시 홈화면으로 감, 프로필탭을 다시 누르면 온보딩 회원정보 입력(연락처) 화면이 뜸. 추후 테스트 불가.
- [ ] 로그인 + 기존 전화(활동): 연동 후 리다이렉트
- [ ] 로그인 + 비활성: 재가입 요청 → pending 단계 표시
- [ ] 로그인 + pending: pending 안내 노출
- [ ] `/profile`: PB 카드·UTMB·기록 섹션 로드(기록은 아직 v1 `race_result`)
- [ ] `/profile/edit`: 이름·성별·생일·이메일 저장 후 새로고침 반영
- [ ] `/profile/bank`: 은행·계좌 저장 반영
- [ ] 프로필 사진 업로드(용량·형식 제한 메시지 포함)

**테스트 — 관리자(owner/admin)**

- [ ] `/admin` 진입: 비관리자는 리다이렉트
- [ ] `/admin/members`: 목록·검색·필터(활동/비활성/대기)
- [ ] 멤버 상세에서 활성/비활성 전환
- [ ] 관리자 지정/해제(본인·크루장은 정책대로 막히는지)
- [ ] `/admin/approvals`: 대기 목록, 승인·거절 후 목록 갱신
- [ ] 관리자 대시보드 통계(대기/활동/전원 수가 팀 기준으로 이상 없는지)

**테스트 — 대회 탭 연동**

- [ ] `/races`: 로그인 시 멤버 상태(ready / 온보딩 필요) 표시 정상

### 9.2 슬라이스 2 — 대회 (`competition` → `comp_mst`·`comp_evt_cfg`)

**바꿀 예정인 주요 소스(§3 기준)**

`app/actions/create-competition.ts`, `search-competitions.ts`, `get-past-gigang-competitions.ts`, `admin/manage-competition.ts`(일부), `app/(main)/races/page.tsx`, `app/(info)/admin/competitions/page.tsx`, `components/races/race-list-view.tsx`, `competition-detail-dialog.tsx`, `components/profile/race-record-dialog.tsx`, `app/(main)/page.tsx`의 대회 조회 구간

**테스트**

- [ ] 대회 목록·기강/전체 탭·지난 대회 펼침
- [ ] 대회 상세·메타 수정(권한 있는 계정)
- [ ] 대회 생성(관리자)
- [ ] 홈 카드의 예정 대회·참가 인원 집계(슬라이스 3과 겹치면 3 완료 후 재확인)

### 9.3 슬라이스 3 — 참가 (`competition_registration` → `comp_reg_rel` 등)

**바꿀 예정인 주요 소스**

`components/home/upcoming-races.tsx`, `race-list-view.tsx`, `competition-detail-dialog.tsx`, `race-record-dialog.tsx`, `app/(main)/page.tsx`, `app/actions/admin/manage-competition.ts`

**테스트**

- [ ] 참가 신청·중복/검증 메시지
- [ ] 참가 취소
- [ ] 홈·대회 목록의 참가 수·내 참가 표시
- [ ] 관리자 화면에서 참가자 목록·연계

### 9.4 슬라이스 4 — 기록 (`race_result` → `rec_race_hist`)

**바꿀 예정인 주요 소스**

`components/profile/race-record-dialog.tsx`, `race-history-dialog.tsx`, `app/(main)/records/page.tsx`, `app/(main)/profile/page.tsx`, `app/actions/admin/manage-record.ts`, `app/(info)/admin/records/page.tsx`, `get-admin-stats.ts`의 기록 카운트

**테스트**

- [ ] 기록 추가·수정·삭제(본인 RLS)
- [ ] `/records` 마라톤·철인·UTMB 트레일 구간(UTMB는 v2 유지)
- [ ] `/profile` PB 카드 데이터 소스가 v2와 일치하는지
- [ ] 관리자 기록 화면 검색·삭제

### 9.5 슬라이스 5 — 부가

**UTMB (`utmb_profile` → `mem_utmb_prf`) — 반영 예정**

| 경로 | 확인 |
|------|------|
| `personal-best-grid.tsx`, `profile/page.tsx`, `records/page.tsx` | `utmb_profile` 유지 동작 확인 후 `mem_utmb_prf`로 동일 동작 이관 |

**테스트**

- [ ] UTMB 연동·조회·삭제 (`rct_race_nm`, `rct_race_rec` 기준 저장/표시 포함)
- [ ] 전당 트레일 탭에 UTMB 보유자 + 최근 대회 표시

**PB(`personal_best`) — 미반영 시**

| 경로 | 확인 |
|------|------|
| `app/(main)/page.tsx` | 홈 최근 PB 위젯 |

**테스트(반영 후)**

- [ ] 홈 PB 위젯이 v2 설계(파생 저장 또는 조인)와 맞는지

### 9.8 전체 완료 후 — 회귀(한 번에)

슬라이스 1~4·5(잔여)까지 끝난 뒤, **로직 누락·오류 없음**을 목표로 다음을 순서 없이 전부 통과시킨다.

**자동**

- [ ] `pnpm run lint`
- [ ] `pnpm run build`
- [ ] (선택) E2E·스토리북 팀 정책이 있으면 동일 파이프라인

**계정·플로우**

- [ ] U1 비로그인: 홈·대회·기록(공개)·로그인 페이지
- [ ] U2 일반 회원: 온보딩 생략 경로, 프로필·설정·은행·아바타·UTMB·기록 CRUD
- [ ] U3 온보딩 전체(신규·기존·비활성·pending)
- [ ] U4 참가 신청/취소·홈·대회 UI 연계
- [ ] U5 기록 CRUD·전당·관리자 기록
- [ ] U6 관리자: 멤버·승인·대회·참가·기록·통계

**데이터·보안**

- [ ] `migration-map` §5.2·`rollout-progress` §6 게이트에 해당하는 검증 SQL 최종 실행(환경별)
- [ ] 타 팀/비소속 RLS 시나리오(`cutover-checklist` §3.2)

**검색(레거시 잔재)**

- [ ] 저장소에서 `from("member")`·`from("competition")` 등 v1 테이블 참조가 **의도된 예외만** 남았는지(`rg '\\.from\\(\"(member|competition|…)'` 등으로 확인, 이중 기록·아카이브만 문서화)
