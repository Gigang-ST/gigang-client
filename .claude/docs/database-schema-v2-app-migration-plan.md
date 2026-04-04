# 애플리케이션 v2 전환 계획 (dev·prd 공통)

레거시 테이블(`member`, `competition`, `competition_registration`, `race_result`, `personal_best`, `utmb_profile`) 의존 코드를 v2 스키마(`mem_mst`, `comp_mst`, `comp_reg_rel`, `rec_race_hist` 등)로 옮길 때의 **슬라이스 순서·인벤토리·검증·운영 절차**를 정리한다.

| 참고 문서 | 용도 |
|-----------|------|
| `database-schema-v2-migration-map.md` | 컬럼·FK·검증 SQL |
| `database-schema-v2-rollout-progress.md` | DB 백필·§6.5 `archive.old_*`·§7 앱 전환 체크 |
| `database-schema-v2-cutover-checklist.md` | prd 컷오버·백업·RLS·§8 시행착오 방지 |
| `database-schema-v2-member-domain.md` | 회원·팀·관리자 필드 매핑 |

---

## 1. 원칙 (dev와 prd 동일)

1. **한 번에 전부 교체하지 않는다.** 도메인 슬라이스 단위로 나누고, 슬라이스마다 **인벤토리 → 쿼리 교체 → 스모크 → PR** 을 반복한다.
2. **prd도 dev와 같은 순서·같은 슬라이스 경계를 쓴다.** 차이는 **DB 컷오버 창구·백업·마이그레이션 적용 시점**뿐이다.
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
| **3 참가** | `competition_registration` | `comp_reg_rel`, `team_comp_plan_rel` | `comp_reg_id`·`comp_evt_id` 조인 |
| **4 기록** | `race_result` | `rec_race_hist` | B-2/B-3·UK 중복 스크립트: `scripts/sql/v2_p7_race_result_uk_duplicate_list.sql` |
| **5 파생·부가** | `personal_best`, `utmb_profile` | v2 범위 밖 또는 추후 | `migration-map`/rollout: PB는 파생, UTMB 보류 가능 — **제품 결정 후** 슬라이스 범위 확정 |

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

### 슬라이스 5 — PB / UTMB (제품 결정 후)

| 경로 | 용도 |
|------|------|
| `app/(main)/page.tsx` | `personal_best` + `member` join |
| `components/profile/personal-best-grid.tsx` | `utmb_profile` |
| `app/(main)/records/page.tsx` | `race_result`, `utmb_profile` |
| `app/(main)/profile/page.tsx` | `race_result`, `utmb_profile` |

### 기타·복합

| 경로 | 비고 |
|------|------|
| `app/(main)/page.tsx` | 슬라이스 1·2·3·5 교차 — **각 슬라이스 완료 후 홈 통합 스모크** |
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

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-05 | 초안: 슬라이스·인벤토리·dev/prd 공통 절차 |
