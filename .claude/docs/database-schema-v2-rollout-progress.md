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
| 마이그레이션 파일 ↔ 원격 | `supabase/migrations/<version>_*.sql` 의 `<version>` 은 원격 `supabase_migrations.schema_migrations.version` 과 맞춘다. MCP `apply_migration`·대시보드 수동 적용 후에는 DB에 기록된 버전으로 로컬 파일명을 맞추거나 `supabase migration repair` 로 정리한다. |

## 3) 메타 (담당·일정)

| 항목 | 값 |
|------|-----|
| 진행 상태 요약 | 웨이브 6 DDL 완료 → 백필·앱 전환·컷오버 QA(체크리스트 §3) |
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

- [x] `cmm_cd_grp_mst` DDL (`supabase/migrations/20260404064718_v2_wave1_common_code.sql`)
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

- [x] 마이그레이션 파일 `supabase/migrations/20260404081732_v2_wave2_member_team.sql` (웨이브 1: `20260404064718_v2_wave1_common_code.sql`)
- [x] `mem_mst` (`gdr_enm` → 기존 `public.gender` 타입 사용)
- [x] `team_mst`
- [x] `team_mem_rel`
- [x] PK/UK/FK·인덱스 (설계서 기준) + `mem_id` → `auth.users(id)` FK
- [x] RLS 초안 (`database-schema-v2-member-domain.md` §5) — 팀 신규 생성·첫 멤버는 `service_role` 경로 전제
- [x] **(검증)** supabase-gigang-dev: `mem_mst` / `team_mst` / `team_mem_rel` 존재 확인 (2026-04-04)

```sql
-- 기대: 3행 (mem_mst, team_mst, team_mem_rel)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('mem_mst', 'team_mst', 'team_mem_rel')
order by 1;
```

### 웨이브 3 — 대회·참가

- [x] 마이그레이션 파일 `supabase/migrations/20260404083704_v2_wave3_competition.sql`
- [x] `comp_mst` (`comp_sprt_cd` nullable + CHECK, `ext_id` UK)
- [x] `comp_evt_cfg` (`evt_cd` CHECK = `cmm_cd` COMP_EVT_CD 값과 동일)
- [x] `team_comp_plan_rel` (`team_mst`·`comp_mst` FK)
- [x] `comp_reg_rel` (`comp_reg_id` 기본 `gen_random_uuid()`, 백필 시 AS-IS `id` 명시 삽입), `comp_evt_id` nullable, FK `ON DELETE SET NULL`
- [x] RLS: `comp_mst`/`comp_evt_cfg` 공개 SELECT + 레거시 `member.admin` CUD; 팀 테이블은 `team_mem_rel` 기준 격리
- [x] **(검증)** supabase-gigang-dev: FK `comp_evt_cfg→comp_mst`, `team_comp_plan_rel→team_mst/comp_mst`, `comp_reg_rel→team_comp/mem_mst/comp_evt_cfg` (2026-04-04)

```sql
select tc.table_name, kcu.column_name, ccu.table_name as foreign_table
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  and tc.table_name in ('comp_evt_cfg','team_comp_plan_rel','comp_reg_rel')
order by 1, 2;
```

### 웨이브 4 — 기록

- [x] 마이그레이션 파일 `supabase/migrations/20260404085737_v2_wave4_rec_race_hist.sql`
- [x] `rec_race_hist` (`race_result_id` 기본 `gen_random_uuid()`, 백필 시 AS-IS `race_result.id` 명시)
- [x] `comp_id` / `comp_evt_id` nullable, FK `ON DELETE SET NULL` (B-3·매핑 실패 행 허용)
- [x] UK `(mem_id, comp_evt_id, race_dt, race_nm, vers)`, `rec_src_cd` CHECK (`manual`/`imported`/`api`)
- [x] RLS: 공개 SELECT, 본인 `mem_id` 기준 INSERT/UPDATE/DELETE (레거시 `race_result` 와 동등)
- [x] **(검증)** supabase-gigang-dev: FK → `mem_mst`, `comp_mst`, `comp_evt_cfg` (2026-04-04)

```sql
select kcu.column_name, ccu.table_name as foreign_table
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  and tc.table_name = 'rec_race_hist'
order by kcu.ordinal_position;
```

### 웨이브 5 — 회비 (신규 도메인)

- [x] ENUM: `fee_txn_io_enm`, `fee_exm_tp_enm`, `fee_grant_src_enm` (`20260404093618_v2_wave5_fee_core.sql`)
- [x] `fee_policy_cfg`, `fee_xlsx_upd_hist`, `fee_txn_hist`, `fee_due_pay_hist`, `fee_due_exm_cfg`, `fee_due_exm_hist` (동일 파일, `set_v2_upd_at` 트리거·COMMENT)
- [x] `fee_mem_bal_snap` + 회비 7테이블 RLS·정책·`GRANT` (`20260404093853_v2_wave5_fee_snap_rls.sql`, 선행: `20260404093618`)
- [x] **(검증)** supabase-gigang-dev MCP `apply_migration` + `execute_sql` (2026-04-04): ENUM 3종, `fee_*` 테이블 7개 존재

```sql
-- 기대: typname 3행
select typname
from pg_type
where typname in ('fee_txn_io_enm', 'fee_exm_tp_enm', 'fee_grant_src_enm')
order by 1;

-- 기대: 7행 (fee_due_exm_cfg, fee_due_exm_hist, fee_due_pay_hist, fee_mem_bal_snap, fee_policy_cfg, fee_txn_hist, fee_xlsx_upd_hist)
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'fee_%'
order by 1;
```

### 웨이브 6 — RLS·트리거·정책

- [x] 회원 도메인 RLS 초안 (`database-schema-v2-member-domain.md`) — **웨이브 2** (`20260404081732_v2_wave2_member_team.sql`)
- [x] 대회/참가 RLS·GRANT — **웨이브 3** (`20260404083704_v2_wave3_competition.sql`): `comp_mst`·`comp_evt_cfg` 공개 SELECT, 팀 스코프 `team_comp_plan_rel`·`comp_reg_rel`, 전역 CUD는 레거시 `member.admin` 경로
- [x] 기록 `rec_race_hist` RLS·GRANT — **웨이브 4** (`20260404085737_v2_wave4_rec_race_hist.sql`): 공개 SELECT, 본인 `mem_id` CUD
- [x] 회비(`fee_*`) RLS·GRANT — **웨이브 5b** (`20260404093853_v2_wave5_fee_snap_rls.sql`)
- [x] **웨이브 6 마이그레이션** `20260404094818_v2_wave6_rls_refine.sql`: `is_legacy_platform_admin()`로 `comp_mst`/`comp_evt_cfg` 관리자 정책 통합, `set_v2_upd_at()`·신규 함수 COMMENT (v2는 `upd_at` + `set_v2_upd_at` 관례 고정)
- [ ] (검증·수동) 역할별 시나리오 — `database-schema-v2-cutover-checklist.md` §3 (단일팀/다중팀/owner·admin/비소속 등)

```sql
-- 기대: 1행 (레거시 관리자 검사 함수)
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = 'is_legacy_platform_admin';

-- 기대: 한글 COMMENT (set_v2_upd_at 설명 갱신됨)
select obj_description('public.set_v2_upd_at()'::regprocedure);
```

### 의도적 비포함 (문서 기준)

- [ ] 확인함: `personal_best` 물리 이관 없음 → `rec_race_hist` 파생
- [ ] 확인함: `utmb_profile` v2 범위 미포함(보류)
- [ ] 확인함: 팀 이벤트·칭호 도메인은 설계 보류 구간

## 5) 데이터 백필

**단일 기준:** 컬럼 매핑·값 변환·금지 사항은 `database-schema-v2-migration-map.md` §3 전체를 따른다.  
**검증 SQL:** `migration-map` §5.2에 있는 쿼리를 **그대로** 사용한다(담당자 임의 수정 금지).  
**환경:** **dev에서 단계·검증·앱 스모크를 끝낸 뒤** prd 백필·컷오버는 별도 승인·창구에서 진행한다.

### 5.0 요약 체크리스트 (도메인)

- [ ] `member` → `mem_mst` + `team_mem_rel` (전화·이메일 정규화, `crt_at`/`join_dt` 구분)
- [ ] `competition` → `comp_mst` + `comp_evt_cfg`
- [ ] `competition_registration` → `team_comp_plan_rel` + `comp_reg_rel` (ID 1:1)
- [ ] `race_result` → `rec_race_hist` (ID 1:1, `comp_id`/`comp_evt_id` 매핑 실패 건 리포트)
- [ ] 회비 테이블: 정책 시드 등 초기 데이터 (없으면 빈 테이블 유지)
- [ ] owner 최소 1명 등 운영 규칙 수동 보정 여부 기록

### 5.1 단계별 실행 순서 (의존 순·테이블 묶음)

FK와 매핑 문서 순서에 맞춘 **페이즈**이다. 한 페이즈 = (선택) 마이그레이션/SQL 파일 1개 또는 PR 1개 단위로 나누는 것을 권장한다.

| 페이즈 | 작업 (AS-IS → v2) | 산출 | 페이즈 직후 최소 확인 |
|--------|-------------------|------|------------------------|
| **P0** | 기본 팀 1행 확보 | `team_mst` (`vers=0` 정본) | `team_id` 고정값을 팀 전체가 동일하게 참조하는지 문서화(코드·시드 주석) |
| **P1** | `member` → `mem_mst` | `mem_mst` | 행 수·샘플 행으로 정규화(전화·이메일)·`crt_at` 출처가 `member.created_at`만인지 |
| **P2** | `member` → `team_mem_rel` | `team_mem_rel` | 멤버 수와 행 수 정합, `join_dt`/`mem_st_cd`/`team_role_cd` 매핑표 준수 |
| **P3** | `competition` → `comp_mst` | `comp_mst` | AS-IS 대회 건수와 v2 정본 건수(의도된 차이는 메모) |
| **P4** | `competition.event_types[]` → `comp_evt_cfg` | `comp_evt_cfg` | `comp_id`별 종목 행 존재(정책상 0건 허용 시 명시) |
| **P5** | (`competition_id`, 기본 `team_id`) → `team_comp_plan_rel` | `team_comp_plan_rel` | 이후 `comp_reg_rel`이 참조할 `team_comp_id` 준비 완료 |
| **P6** | `competition_registration` → `comp_reg_rel` | `comp_reg_rel` | **`comp_reg_id` = AS-IS `id` 1:1** (재발급 금지) |
| **P7** | `race_result` → `rec_race_hist` | `rec_race_hist` | **`race_result_id` = AS-IS `id` 1:1**; B-3 null 집계·샘플 리포트 |
| **P8** | 회비 (선택) | `fee_policy_cfg` 등 시드 | 레거시 회비 테이블 없음 → 시드만 또는 빈 테이블 유지 |

**재실행·dev 반복:** `INSERT … SELECT … WHERE NOT EXISTS` 또는 `ON CONFLICT` 등으로 동일 페이즈를 여러 번 돌려도 안전하게 설계한다.

**매핑 예외:** `member.status` 등 표에 없는 값은 **백필 중단 → 수동 리스트 → 매핑표 갱신 후 재실행** (`migration-map` §3.1).

### 5.2 페이즈 ↔ 검증 SQL (`migration-map` §5.2 ID)

| 시점 | 실행할 검증(문서 §5.2) | 비고 |
|------|-------------------------|------|
| P1 완료 후 | **A-1, A-2, A-3, A-4** | 계정·정규화 중복 |
| P2 완료 후 | **C-1, C-2** | 코드그룹 정합; **팀당 owner ≥ 1**은 별도 쿼리·수동 보정(§3.1 합의) |
| P6 완료 후 | **B-1** | 참가 누락 0건 목표 |
| P7 완료 후 | **B-2, B-3** | 기록 누락 0건; B-3는 **dev에서 null 허용 + 리포트 필수**, prd는 팀 재합의 |
| 백필 전체 후 | **D-1, D-2** | 샘플 10명·대조용 집계; 아래 **§6 표**에 건수·메모·통과 여부 기입 |
| 앱 전환 전후 | `database-schema-v2-cutover-checklist.md` §3 | RLS 역할 시나리오(수동) |

### 5.3 dev와 prd (prod) 작업 시 계속 둘 것

| 구분 | dev | prd (prod) |
|------|-----|------------|
| 목적 | 매핑·스크립트·검증 루틴 확정 | 동일 절차를 승인된 창구에서 재현 |
| DDL | 이미 웨이브 1–6 적용됨 | **동일 마이그레이션 세트** 적용 여부·`schema_migrations` 버전 일치 확인 |
| 백필 | 페이즈별 반복·롤백 부담 낮음 | **사전 백업/스냅샷**, 실행 순서·담당자·롤백 절차 문서화 (`cutover-checklist` §6) |
| B-3 | null 행 허용 + PR/이슈에 집계·샘플 첨부 | 컷오버 전 팀 합의로 허용 기준·보정 여부 확정 |
| 앱 | v2 읽기/쓰기 전환은 §7 | prd 전환 시 별도 릴리즈·모니터링 계획 |

**작업하면서 추가할 것:** 이슈/PR 링크, 매핑 실패 id 샘플, 수동 수정 SQL 경로, “prd 실행 일시” 한 줄.

### 5.4 아티팩트·PR 관례 (유지보수용)

- 백필용 SQL은 **DDL 마이그레이션과 분리**해 번호·이름 규칙을 팀과 맞춘다(예: `…_backfill_p1_mem_mst.sql` 또는 저장소 `scripts/backfill/` + 실행 순서 README는 팀 정책에 따름).
- PR 본문에 **페이즈 번호**, **실행 환경(dev)**, **해당 §5.2 검증 ID 결과**(0건 목표면 스크린샷 또는 쿼리 결과 붙여넣기)를 남긴다.
- `is_legacy_platform_admin()` 등 **레거시 `member` 의존** 구간은 백필 후에도 잠시 유지됨을 전제로, v2 단일화 시 정책 교체 일정을 메모한다.

### 5.5 진행 메모 (작업하면서 아래 표 갱신)

| 날짜 | 환경 (dev/prd) | 페이즈 | 요약 (성공/부분/롤백) | 검증 ID (§5.2·§6) | PR / 이슈 |
|------|----------------|--------|----------------------|-------------------|-----------|
| | | | | | |

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
| 2026-04-04 | 웨이브 1: `20260404064718_v2_wave1_common_code.sql`(원격 `schema_migrations` 버전과 동일), dev 적용·검증 | — |
| 2026-04-04 | 웨이브 1 검증: dev에서 grp_cnt=10, cd_cnt=39, 빈 그룹 0건 (MCP) | — |
| 2026-04-04 | 웨이브 2: `20260404081732_v2_wave2_member_team.sql` 추가, dev MCP `apply_migration`로 적용·테이블 존재 검증 | — |
| 2026-04-04 | 로컬 마이그레이션 파일명을 원격 `schema_migrations`(20260404064718, 20260404081732)에 맞춤 — CLI·대시보드에서 “미적용”처럼 보이던 불일치 해소 | — |
| 2026-04-04 | 웨이브 3: `20260404083704_v2_wave3_competition.sql`, dev MCP 적용·FK 검증 | — |
| 2026-04-04 | 웨이브 4: `20260404085737_v2_wave4_rec_race_hist.sql`, dev MCP 적용·FK 검증 | — |
| 2026-04-04 | 웨이브 5: `20260404093618_v2_wave5_fee_core.sql`, `20260404093853_v2_wave5_fee_snap_rls.sql` — dev MCP `apply_migration` 순차 적용; 로컬 파일명을 원격 `schema_migrations`(93618·93853)에 맞춤 | — |
| 2026-04-04 | 웨이브 5 검증: ENUM 3종·`fee_*` 테이블 7개 존재 (MCP `execute_sql`) | — |
| 2026-04-04 | 웨이브 6: `20260404094818_v2_wave6_rls_refine.sql` — dev MCP `apply_migration`; 로컬 파일명을 원격 `20260404094818`에 맞춤; 대회/기록 RLS는 웨이브 3·4 적용분·웨이브 6 함수 통합으로 정리 | — |
| 2026-04-04 | §5 백필: 페이즈 P0–P8 실행 순서, `migration-map` §5.2 검증 매핑, dev/prd 게이트, PR·진행 메모 표(§5.5) 추가 | — |
