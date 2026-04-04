# DB 스키마 v2 전환 — 작업 진행 상황 (초안)

## 1) 문서 목적

- v2 DDL·시드·백필·앱 전환·레거시 정리까지의 **진행 상태를 한곳에서 추적**한다.
- 상세 설계·매핑·검증 쿼리는 아래 문서를 단일 기준으로 두고, 본 문서는 **체크리스트·웨이브·게이트**만 담는다.

| 참고 문서 | 용도 |
|-----------|------|
| `database-schema-v2.md` | 네이밍·공통컬럼·vers·RLS 원칙 |
| `database-schema-v2-member-domain.md` | 회원/팀 엔터티 |
| `database-schema-v2-domains.md` | 대회·기록·회비 |
| `database-schema-v2-migration-map.md` | AS-IS↔v2 매핑·검증 SQL |
| `database-schema-v2-cutover-checklist.md` | 점진 전환·RLS·성능·롤백 |
| `database-abbreviation-dictionary.md` | 약어 |

## 2) 적용 환경·원칙 (고정)

| 항목 | 내용 |
|------|------|
| 1차 대상 DB | `supabase-gigang-dev` (문서 기준) |
| 프로덕션 | 별도 승인·컷오버 계획 후 |
| 레거시 테이블 | 앱이 v1을 쓰는 동안 **RENAME(prefix) 지연** — 전환 검증 후 보존/폐기 |
| `vers` 정본 | 마이그레이션 검증 SQL은 **`vers = 0` + `del_yn = false`** 기준 — DDL/백필과 반드시 일치시킬 것 |
| ID 보존 | `comp_reg_rel.comp_reg_id` = AS-IS `competition_registration.id`, `rec_race_hist.race_result_id` = `race_result.id` (1:1) |

## 3) 메타 (담당·일정)

| 항목 | 값 |
|------|-----|
| 진행 상태 요약 | 웨이브 1 완료 → 웨이브 2 대기 |
| DB 담당 | (이름) |
| 앱 담당 | (이름) |
| 최종 갱신일 | 2026-04-04 |

## 3.1) 웨이브 0 — 완료 기록 (2026-04-04)

웨이브 0는 **DDL 적용 전** 사전 합의만 다룬다.

### 적용 대상(dev) 재확인

- 대상 Supabase 프로젝트는 문서·MCP 기준 **`supabase-gigang-dev`** 로 한정한다.
- 마이그레이션 적용·SQL 실행 전에 대시보드 상단 **프로젝트 이름/ ref** 또는 연결 문자열이 dev인지 반드시 확인한다.
- **프로덕션(`supabase-gigang-prd`)에는 웨이브 1 이전 단계에서 DDL을 적용하지 않는다.**
- 로컬 도구(MCP 등)는 실수 방지를 위해 **dev만 연결**해 두는 것을 권장한다(prd 해제 상태 유지).

### 백업·스냅샷 정책 (dev)

| 구분 | 권장 |
|------|------|
| 구조 변경 직전 | Supabase 대시보드에서 **수동 시점**을 메모하거나, 팀 공유 채널에 “dev 스키마 변경 시작” 공지 |
| 덤프 | 로컬에서 `supabase link`가 dev를 가리키는지 확인한 뒤 `pg_dump` 또는 Supabase CLI로 **스키마+데이터 덤프** 1회 보관 (팀 저장소 정책에 맞는 위치, 시크릿 미포함) |
| 롤백 | dev 데이터가 치명적이지 않으면 **마이그레이션 되돌리기 / 덤프 복원** 중 택일; PR에서 롤백 절차 한 줄이라도 남긴다 |

CI에서 자동 백업을 두지 않았다면, 위 **수동 덤프**를 웨이브 1 직전 게이트로 둔다.

### 이관 규칙·오픈 이슈 합의 (`migration-map` 연동)

`database-schema-v2-migration-map.md` §6 오픈 이슈에 대해 **dev 진행용**으로 아래처럼 고정한다. prd 컷오버 전에 재검토 가능.

| 이슈 | 구분 | 합의 (dev 기준) |
|------|------|-----------------|
| `race_result` → `rec_race_hist`의 `comp_id` / `comp_evt_id` 매핑 실패(B-3) | Blocker 완화 | **dev:** null 행을 일단 허용한다. 다만 백필 PR에는 **B-3 쿼리 결과(건수 + 필요 시 실패 행 id 샘플)** 를 첨부한다. **prd 컷오버 전:** 실패 건 수동 보정 또는 매핑 규칙 보강 후, 합격 기준을 팀이 재합의한다. |
| 팀당 owner 최소 1명 | Non-blocker | **백필 직후** `team_mem_rel`에 owner가 없으면, 운영 합의 하에 **수동 SQL로 1명 지정**한다. 자동 규칙은 추후 개선. |

그 외 매핑·정규화·ID 1:1 보존 규칙은 **`database-schema-v2-migration-map.md` 전체를 단일 기준**으로 따른다.

## 4) 웨이브별 진행 (DDL·시드)

웨이브는 **의존 순서** 기준이다. 마이그레이션을 파일 하나로 묶어도 되고, 웨이브마다 파일을 나눠도 된다.

### 웨이브 0 — 사전

- [x] 적용 대상이 dev인지 재확인 (위 §3.1)
- [x] 로컬/CI에서 `supabase db` 또는 대시보드로 백업·스냅샷 정책 합의 (위 §3.1 표)
- [x] `database-schema-v2-migration-map.md`의 이관 규칙·오픈 이슈(B-3·owner) 합의 (위 §3.1 표)

### 웨이브 1 — 공통코드

- [x] `cmm_cd_grp_mst` DDL (`supabase/migrations/20260404120000_v2_wave1_common_code.sql`)
- [x] `cmm_cd_mst` DDL (동일 파일)
- [x] 코드그룹·코드 시드 (`migration-map` §2.1, 그룹 10개·코드 39행)
- [x] RLS: `anon`/`authenticated` SELECT만 (`del_yn = false`), 변경은 `service_role` 경로 전제
- [x] **(검증)** supabase-gigang-dev MCP `execute_sql` (2026-04-04): `grp_cnt=10`, `cd_cnt=39`, 코드 없는 그룹 **0건**

```sql
-- 기대: grp_cnt = 10, cd_cnt = 39
select
  (select count(*) from public.cmm_cd_grp_mst where vers = 0 and del_yn = false) as grp_cnt,
  (select count(*) from public.cmm_cd_mst where vers = 0 and del_yn = false) as cd_cnt;

-- 기대: 0행
select g.cd_grp_cd
from public.cmm_cd_grp_mst g
where g.vers = 0 and g.del_yn = false
  and not exists (
    select 1 from public.cmm_cd_mst c
    where c.cd_grp_id = g.cd_grp_id and c.vers = 0 and c.del_yn = false
  );
```

### 웨이브 2 — 회원·팀

- [ ] `mem_mst` (필요 시 `gdr_enm` 등 enum 타입)
- [ ] `team_mst`
- [ ] `team_mem_rel`
- [ ] PK/UK/FK·인덱스 (설계서 기준)
- [ ] (검증) 테이블 생성 및 제약 오류 없음

### 웨이브 3 — 대회·참가

- [ ] `comp_mst`
- [ ] `comp_evt_cfg`
- [ ] `team_comp_plan_rel`
- [ ] `comp_reg_rel`
- [ ] (검증) FK 체인

### 웨이브 4 — 기록

- [ ] `rec_race_hist`
- [ ] (검증) `mem_id` / `comp_id` / `comp_evt_id` FK

### 웨이브 5 — 회비 (신규 도메인)

- [ ] `fee_xlsx_upd_hist`
- [ ] `fee_txn_hist`
- [ ] `fee_policy_cfg`
- [ ] `fee_due_pay_hist`
- [ ] `fee_due_exm_cfg`
- [ ] `fee_due_exm_hist`
- [ ] `fee_mem_bal_snap`
- [ ] (검증) `team_id` / `mem_id` 등 FK

### 웨이브 6 — RLS·트리거·정책

- [ ] 회원 도메인 RLS 초안 적용 (`database-schema-v2-member-domain.md`)
- [ ] 대회/기록/회비 테이블 RLS (도메인별 확정)
- [ ] `updated_at` 등 공통 트리거 (프로젝트 관례에 맞게)
- [ ] (검증) 역할별 시나리오 — `database-schema-v2-cutover-checklist.md` 3절

### 의도적 비포함 (문서 기준)

- [ ] 확인함: `personal_best` 물리 이관 없음 → `rec_race_hist` 파생
- [ ] 확인함: `utmb_profile` v2 범위 미포함(보류)
- [ ] 확인함: 팀 이벤트·칭호 도메인은 설계 보류 구간

## 5) 데이터 백필

- [ ] `member` → `mem_mst` + `team_mem_rel` (전화·이메일 정규화, `crt_at`/`join_dt` 구분)
- [ ] `competition` → `comp_mst` + `comp_evt_cfg`
- [ ] `competition_registration` → `team_comp_plan_rel` + `comp_reg_rel` (ID 1:1)
- [ ] `race_result` → `rec_race_hist` (ID 1:1, `comp_id`/`comp_evt_id` 매핑 실패 건 리포트)
- [ ] 회비 테이블: 정책 시드 등 초기 데이터 (없으면 빈 테이블 유지)
- [ ] owner 최소 1명 등 운영 규칙 수동 보정 여부 기록

## 6) 검증 게이트 (`migration-map` 5.2·5.3)

| ID | 항목 | 목표 | 결과 (건수/메모) | 통과 |
|----|------|------|------------------|------|
| A-1 | 행 수 비교 | 기록 | | ☐ |
| A-2 | v2 누락 `mem_id` | 0건 | | ☐ |
| A-3 | 정규화 이메일 중복 | 0건 | | ☐ |
| A-4 | 정규화 전화 중복 | 0건 | | ☐ |
| B-1 | `comp_reg_rel` 누락 | 0건 | | ☐ |
| B-2 | `rec_race_hist` 누락 | 0건 | | ☐ |
| B-3 | `comp_id`/`comp_evt_id` null 집계 | dev: 리포트 필수·null 허용. prd: 팀 재합의 | | ☐ |
| C-1 | `mem_st_cd` 코드그룹 일치 | 0건 위반 | | ☐ |
| C-2 | `team_role_cd` 코드그룹 일치 | 0건 위반 | | ☐ |
| D-1/D-2 | 해시 샘플 10명 + 화면 검수 | 체크리스트 첨부 | | ☐ |

## 7) 애플리케이션 전환 (dev)

- [ ] Supabase 타입/쿼리 경로를 v2 테이블 기준으로 변경 (도메인별 분할 가능)
- [ ] `getCurrentMember()` 등 인증·멤버 조회 경로 점검
- [ ] 회비·대회·기록 화면 스모크 테스트
- [ ] (선택) 이중 쓰기 — prd 전략 별도 문서화

## 8) 레거시 정리 (앱 v2 단일화 이후)

- [ ] v1 테이블 의존 코드 제거 확인
- [ ] v1 테이블 `legacy_` 등 prefix RENAME 또는 읽기 전용 정책
- [ ] 물리 DROP 일정·승인

## 9) 컷오버 체크리스트 상호 참조

`database-schema-v2-cutover-checklist.md`의 2(정합성)·4(성능)·6(롤백)·7(DoD)절을 **prd 또는 dev 최종 완료 시** 함께 마감한다.

## 10) 변경 로그 (본 진행 문서)

| 날짜 | 변경 내용 | 작성자 |
|------|-----------|--------|
| 2026-04-04 | 초안 작성 (웨이브·게이트·참조 문서 연계) | — |
| 2026-04-04 | 웨이브 0 완료: dev 한정·백업 방침·B-3/owner 합의 기록 (§3.1) | — |
| 2026-04-04 | 웨이브 1: `20260404120000_v2_wave1_common_code.sql` 추가(RLS·시드 포함), dev 적용 대기 | — |
| 2026-04-04 | 웨이브 1 검증: dev에서 grp_cnt=10, cd_cnt=39, 빈 그룹 0건 (MCP) | — |
