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
| `database-schema-v2-app-migration-plan.md` | **앱 v2 전환** 슬라이스·인벤토리·검증(dev/prd 공통) |
| `database-abbreviation-dictionary.md` | 약어 |

## 2) 적용 환경·원칙 (고정)

| 항목 | 내용 |
|------|------|
| 1차 대상 DB | `supabase-gigang-dev` (문서 기준) |
| 프로덕션 | 별도 승인·컷오버 계획 후 |
| 레거시 테이블 | 앱이 v1을 쓰는 동안 **RENAME(prefix) 지연** — 전환 검증 후 보존/폐기 |
| `vers` 정본 | 마이그레이션 검증 SQL은 **`vers = 0` + `del_yn = false`** 기준 — DDL/백필과 반드시 일치시킬 것 |
| ID 보존 | `comp_reg_rel.comp_reg_id` = AS-IS `competition_registration.id`, `rec_race_hist.race_result_id` = `race_result.id` (1:1) |
| 마이그레이션 파일 ↔ 원격 | `supabase/migrations/<version>_*.sql` 의 `<version>` 은 원격 `schema_migrations.version` 과 맞춘다. **MCP `apply_migration`은 적용 시각 기준 버전이 생겨 로컬 타임스탬프와 어긋나기 쉬우므로**, 기록·재현은 **`supabase db push` / CLI** 를 정본으로 두고, MCP로 돌린 뒤에는 `schema_migrations` 정리 또는 `migration repair` 로 맞춘다. |

## 3) 메타 (담당·일정)

| 항목 | 값 |
|------|-----|
| 진행 상태 요약 | 웨이브 6 DDL 완료 → **백필 P0–P7(dev) 완료** → **§6.5 `archive.old_*` 스냅샷 dev 완료**(`64840`) → **prd 컷오버 시 동일 세트** → 앱 전환·QA |
| DB 담당 | (이름) |
| 앱 담당 | (이름) |
| 최종 갱신일 | 2026-04-05 (§6.5 적용 상태 구분 명시) |

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
- [x] `comp_evt_cfg` (`comp_evt_cd` CHECK = `cmm_cd_mst.cd`, 그룹 `COMP_EVT_CD`; 웨이브3 DDL 이후 `20260404102205`로 컬럼명·규약 통일)
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

### 5.0a 백필 운영 원칙 (페이즈 분리·검증 우선)

- **한 마이그레이션/한 PR에 P1~P8을 묶지 않는다.** 통합 백필을 한 번에 돌리다 실패하면, 어디까지 반영됐는지·FK·부분 행만 들어간 상태를 추적하기 어렵다.
- **P0**(`team_mst` 정본·고정 `team_id`)가 안정적으로 끝났다고 판단되면, **P1부터는 페이즈당 하나씩** 진행한다(마이그레이션 파일 1개 또는 수동 SQL 1블록 = 1페이즈).
- 각 페이즈 종료 직후 **§5.2 표에 맞는 검증 SQL**을 실행하고, 결과를 §5.5 표·PR에 남긴 뒤 다음 페이즈로 넘어간다.
- **멱등성:** 모든 `INSERT … SELECT`는 `WHERE NOT EXISTS` / `ON CONFLICT` 등으로 **같은 페이즈를 재실행해도 안전**하게 쓴다.
- **dev 현재 상태:** 과거 통합 백필 시도로 `schema_migrations`에 백필 버전이 올라가 있어도, **실제 행은 `team_mst`만 있는 것처럼 보이는 등 부분 적용**일 수 있다. 다음 페이즈 시작 전에 `SELECT count(*)`로 v1/v2 건수를 찍고 §5.5에 메모한다.
- 레포의 `20260404102200_v2_backfill_p0_p5.sql`, `20260404102309_v2_backfill_p6_p8.sql`는 **참고용 통합본**으로 두고, 앞으로는 **`…_backfill_p1_mem_mst.sql` 식으로 페이즈별 파일을 추가**하는 것을 권장한다(통합본을 고치며 재적용하는 것보다 새 버전으로 나누는 편이 안전).
- **버전 번호:** 페이즈 분할 마이그레이션은 `20260404102200`보다 크고 `20260404102309`보다 작은 타임스탬프를 써서 통합 백필 사이에 끼운다(예: **`20260404102201`…`02208`** — P7까지).
- **`20260404102309` 끝단 `DROP FUNCTION`:** 통합 P6–P8 마이그레이션 마지막에 `migration_v2_norm_*` / `map_*` 를 제거한다. 이후 페이즈별 스크립트에서 필요한 함수는 **해당 페이즈 파일에서 `CREATE OR REPLACE`로 다시 둔다**(P1 파일이 `norm_phone` / `norm_email` 복구).

### 5.0 요약 체크리스트 (도메인)

- [x] `member` → `mem_mst` (**P1** `supabase/migrations/20260404102201_v2_backfill_p1_mem_mst.sql`)
- [x] `member`(+`mem_mst` 정본) → `team_mem_rel` (**P2** `supabase/migrations/20260404102202_v2_backfill_p2_team_mem_rel.sql`)
- [x] `competition` → `comp_mst` (**P3** `supabase/migrations/20260404102203_v2_backfill_p3_comp_mst.sql`)
- [x] `competition.event_types[]` → `comp_evt_cfg` (**P4** `…02204…`; **스키마 정합** `…02205…` `comp_evt_cd`·대문자·`cmm_cd_mst`)
- [x] `competition`+기본 팀 → `team_comp_plan_rel` (**P5** `supabase/migrations/20260404102206_v2_backfill_p5_team_comp_plan_rel.sql`)
- [x] `competition_registration` → `comp_reg_rel` (**P6** `supabase/migrations/20260404102207_v2_backfill_p6_comp_reg_rel.sql`; `02309` 내 동일 INSERT 는 멱등 중복)
- [x] `race_result` → `rec_race_hist` (**P7** `supabase/migrations/20260404102208_v2_backfill_p7_rec_race_hist.sql`; UK 충돌 시 `ON CONFLICT DO NOTHING`, B-3·B-2 메모)
- [ ] 회비: 웨이브 5 DDL만으로 충분 시 **P8 백필 생략**·테이블 빈 상태 유지 가능(`migration-map` §4). 시드는 `02309` 또는 추후 회비 기능 착수 시
- [ ] owner 최소 1명 등 운영 규칙 수동 보정 여부 기록

### 5.1 단계별 실행 순서 (의존 순·테이블 묶음)

FK와 매핑 문서 순서에 맞춘 **페이즈**이다. **한 페이즈 = 마이그레이션 또는 실행 SQL 1개(또는 PR 1개)** 로 쪼갠다(§5.0a).

| 페이즈 | 작업 (AS-IS → v2) | 산출 | 페이즈 직후 최소 확인 |
|--------|-------------------|------|------------------------|
| **P0** | 기본 팀 1행 확보 | `team_mst` (`vers=0` 정본) | `team_id` 고정값을 팀 전체가 동일하게 참조하는지 문서화(코드·시드 주석) |
| **P1** | `member` → `mem_mst` | `mem_mst` | 행 수·샘플 행으로 정규화(전화·이메일)·`crt_at` 출처가 `member.created_at`만인지 |
| **P2** | `member` → `team_mem_rel` | `team_mem_rel` | 멤버 수와 행 수 정합, `join_dt`/`mem_st_cd`/`team_role_cd` 매핑표 준수 |
| **P3** | `competition` → `comp_mst` | `comp_mst` | AS-IS 대회 건수와 v2 정본 건수(의도된 차이는 메모) |
| **P4** | `competition.event_types[]` → `comp_evt_cfg` | `comp_evt_cfg` | `comp_id`별 종목 행 존재(정책상 0건 허용 시 명시) |
| **P5** | (`competition_id`, 기본 `team_id`) → `team_comp_plan_rel` | `team_comp_plan_rel` | 이후 `comp_reg_rel`이 참조할 `team_comp_id` 준비 완료 |
| **P6** | `competition_registration` → `comp_reg_rel` | `comp_reg_rel` | **`comp_reg_id` = AS-IS `id` 1:1** (재발급 금지) |
| **P7** | `race_result` → `rec_race_hist` | `rec_race_hist` | **`race_result_id` = AS-IS `id` 1:1** 목표; `uk_rec_race_hist_mem_evt_dt_nm_vers` 충돌 시 **한 건만 유지**(`ON CONFLICT DO NOTHING`). B-2·B-3 집계·샘플 PR 첨부 |
| **P8** | 회비 (선택) | `fee_*` DDL만 유지 | **레거시 회비 테이블 없음** + 앱 회비 로직 **미구현**이면 **빈 테이블로 두어도 됨**. `20260404102309`의 `fee_policy_cfg` 시드 1건은 있으면 이후 기능 붙일 때 편함(없어도 운영 블로킹 아님) |

**재실행·dev 반복:** `INSERT … SELECT … WHERE NOT EXISTS` 또는 `ON CONFLICT` 등으로 동일 페이즈를 여러 번 돌려도 안전하게 설계한다.

**매핑 예외:** `member.status` 등 표에 없는 값은 **백필 중단 → 수동 리스트 → 매핑표 갱신 후 재실행** (`migration-map` §3.1).

### 5.2 페이즈 ↔ 검증 SQL (`migration-map` §5.2 ID)

| 시점 | 실행할 검증(문서 §5.2) | 비고 |
|------|-------------------------|------|
| P1 완료 후 | **A-1, A-2, A-3, A-4** | 계정·정규화 중복 |
| P2 완료 후 | **C-1, C-2** | 코드그룹 정합; **팀당 owner ≥ 1**은 별도 쿼리·수동 보정(§3.1 합의) |
| P3 완료 후 | `competition` 행 수 = `comp_mst`(vers=0) 행 수; AS-IS `id` 누락 anti-join **0건** | `migration-map` §3.2 A); `comp_sprt_cd`는 CHECK·(선택) `COMP_SPRT_CD` 조인으로 이상값 확인 |
| P4 완료 후 | 매핑된 종목만 `comp_evt_cfg`에 삽입; `ON CONFLICT DO NOTHING` 멱등; 미매핑 `event_types[]` 토큰은 집계·샘플로 리포트 | **`20260404102205` 적용 후:** 컬럼 `comp_evt_cd`, 값은 `COMP_EVT_CD`·`cmm_cd_mst.cd` 와 동일 대문자 규약(`5K`, `HALF`, …, `100M`) |
| P5 완료 후 | `competition` 건수 = 기본 팀(`team_id` 고정)의 `team_comp_plan_rel`(vers=0, `del_yn=false`) 건수; `comp_mst` 정본 없는 대회는 행 없음(의도 시 메모) | `migration-map` §3.3 A); P6 `team_comp_id` 조인 전제 |
| P6 완료 후 | **B-1** | `competition_registration` 대비 `comp_reg_rel` 누락 **0건**; `comp_evt_id` null(매핑 실패)은 별도 집계 가능 |
| P7 완료 후 | **B-2, B-3** | B-2: `race_result` 대비 `race_result_id` 누락 **0건** 목표 — UK 중복 매핑 시 예외 건수·샘플 id. B-3: `comp_id`/`comp_evt_id` null 집계(dev 리포트·prd 재합의) |
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
| **prd 시행착오 방지** | dev에서만 할 일 | **`database-schema-v2-cutover-checklist.md` §8** — 동일 마이그레이션 세트·페이즈 순서·`schema_migrations` 정합·`comp_evt_cfg`/02205·백필 함수 수명 주의. 운영에서 컬럼명·코드값을 다시 맞추는 실험 금지 |

**작업하면서 추가할 것:** 이슈/PR 링크, 매핑 실패 id 샘플, 수동 수정 SQL 경로, “prd 실행 일시” 한 줄.

**P1 직후 진단 (선택):**

```sql
select
  (select count(*) from public.member) as member_cnt,
  (select count(*) from public.mem_mst where vers = 0 and del_yn = false) as mem_mst_cnt,
  (select count(*) from public.member m inner join auth.users u on u.id = m.id) as auth_linked_cnt;
```

### 5.4 아티팩트·PR 관례 (유지보수용)

- 백필용 SQL은 **DDL 마이그레이션과 분리**해 번호·이름 규칙을 팀과 맞춘다(예: `…_backfill_p1_mem_mst.sql` 또는 저장소 `scripts/backfill/` + 실행 순서 README는 팀 정책에 따름).
- prd 전용 일회성 DDL(예: **§5.6** `mem_mst` FK 재부착)은 **`scripts/sql/`** 에 두고, 마이그레이션 타임라인과 혼동되지 않게 파일명·주석으로 **실행 환경(prd)·선행 조건**을 명시한다.
- PR 본문에 **페이즈 번호**, **실행 환경(dev)**, **해당 §5.2 검증 ID 결과**(0건 목표면 스크린샷 또는 쿼리 결과 붙여넣기)를 남긴다.
- `is_legacy_platform_admin()` 등 **레거시 `member` 의존** 구간은 백필 후에도 잠시 유지됨을 전제로, v2 단일화 시 정책 교체 일정을 메모한다.

### 5.5 진행 메모 (작업하면서 아래 표 갱신)

| 날짜 | 환경 (dev/prd) | 페이즈 | 요약 (성공/부분/롤백) | 검증 ID (§5.2·§6) | PR / 이슈 |
|------|----------------|--------|----------------------|-------------------|-----------|
| 2026-04-05 | dev | (정책) | 통합 백필 1회 실패 경험 반영 → **P1부터 페이즈 단위 + 검증**으로 재작업하기로 함(§5.0a) | — | — |
| 2026-04-05 | dev | P0 | `team_mst` 정본만 확실히 있다고 가정하고 이후 진행(대회 쪽 부분 행은 대시보드에서 count로 재확인) | — | — |
| 2026-04-05 | dev | P1 | `20260404102201`: `mem_mst` 의 `auth.users` FK 제거 후 **전원 `member` → `mem_mst`** (로그인 없는 시드도 이관). 운영 컷오버 시 auth 정합·필요 시 FK 재부착은 별도 검토. **MCP `apply_migration`은 버전 타임스탬프가 로컬 파일과 어긋나므로** 기록 정리 후 **`supabase db push`로 `20260404102201` 적용 기록을 맞출 것** | A-1~A-4 | — |
| 2026-04-05 | dev | P2 | `20260404102202`: `migration_v2_map_mem_st_cd` 복구(`left` 포함), `mem_mst` 정본과 **INNER JOIN** 후 gigang `team_id`로 `team_mem_rel` 104행. **owner 0건 시 admin 1명 승격** DO 블록 적용 → owner=1. `member`/`mem_mst`/gigang `team_mem_rel` 각 104건 일치. MCP 적용 후 `schema_migrations`를 `20260404102202`로 수동 정렬 | C-1, C-2; owner≥1 자동 1건 | — |
| 2026-04-05 | dev | P3 | `20260404102203`: `competition` → `comp_mst` 멱등 삽입(`comp_id` 1:1). dev **3473**건 = **3473**건. `sport`는 `road`/`trail` 별칭·표준 코드 매핑, 미매칭은 `comp_sprt_cd` null. MCP 적용 후 잘못된 `schema_migrations` 행 삭제·`20260404102203` 기록 | §5.2 P3 행 기준 | — |
| 2026-04-05 | dev | P4 | `20260404102204`: `migration_v2_map_evt_cd` 복구 후 `comp_mst` 정본과 조인해 `event_types[]` → `comp_evt_cfg`. dev: `comp_evt_cfg` 정본 **14**행, `event_types` 비어 있지 않은 대회 **11**건 중 **9**건에 cfg 행 생성. **미매핑 토큰 8건**(예: `20K`, `3K`, `GRANFONDO`, `OLYMPIC`, `SPRINT`) — 매핑표 보강 시 P4 재실행 가능. MCP 버전 `20260404150257` 삭제 후 `20260404102204` 기록 | §5.2 P4 행 | — |
| 2026-04-05 | dev | P5 | `20260404102206`: gigang `team_id` + `competition`·`comp_mst` 정본 조인 → `team_comp_plan_rel` `ON CONFLICT DO NOTHING`. dev **3473** = **3473**. MCP `20260404153803` 삭제 후 `20260404102206` 기록 | §5.2 P5 행 | — |
| 2026-04-05 | dev | P6 | `20260404102207`: `migration_v2_map_evt_cd` 복구 후 `mem_mst`·`team_comp_plan_rel`·`comp_evt_cfg` 조인으로 `comp_reg_rel` 삽입(`comp_reg_id` 1:1). dev **76**건 = **76**, **B-1 누락 0건**. MCP `20260404154451` 삭제 후 `20260404102207` 기록 | B-1 | — |
| 2026-04-05 | dev | P7 | `20260404102208`: `race_result` → `rec_race_hist`, `ON CONFLICT (mem_id, comp_evt_id, race_dt, race_nm, vers) DO NOTHING`. dev `race_result` **178** / `rec_race_hist` 정본 **177**, **B-2 누락 1건**(UK 중복) — 미삽입 `race_result.id` 샘플: `7c91d345-8680-47db-b5b6-4e5fa5db4474`. B-3: `comp_id` null **136**, `comp_evt_id` null **166**. `02309` 동일 INSERT 에도 동일 `ON CONFLICT` 추가. MCP `20260404155517` 삭제 후 `20260404102208` 기록 | B-2, B-3 | — |
| | | | | | |

### 5.6 prd 컷오버: `mem_mst` ↔ `auth.users` FK 재부착

백필 단계(`20260404102201` 등)에서 **`fk_mem_mst__auth_users` 를 제거한 뒤**, 운영에서는 **`mem_id` = Supabase Auth 사용자 UUID(`auth.users.id`)** 가 모두 맞는다는 전제로 FK 를 다시 건다.

| 단계 | 내용 |
|------|------|
| 전제 | `mem_mst` 정본(`vers=0`, `del_yn=false`)의 모든 `mem_id`에 대해 `auth.users` 에 동일 `id` 행이 존재 |
| 권장 환경 | **prd** (dev 는 고아 `mem_id` 가 남아 있으면 아래 **VALIDATE** 가 실패할 수 있음) |
| 아티팩트 | 저장소 **`scripts/sql/prd_cutover_mem_mst_fk_auth.sql`** 한 파일에 순서대로 기술 |
| 순서 | **0)** 고아 진단 쿼리 → **0건 확인** → **1)** `ADD CONSTRAINT … NOT VALID` → **2)** `VALIDATE CONSTRAINT` |
| 설계 참고 | `NOT VALID` 로 기존 행 검사를 늦추고, 정리 후 `VALIDATE` 로 한 번에 검증하는 PostgreSQL 패턴 |
| 롤백 | 동일 파일 하단 주석의 `DROP CONSTRAINT` (승인 하에만) |
| 연계 | `database-schema-v2-cutover-checklist.md` §6(롤백)·백업 창구와 함께 기록 |

**SQL 본문은 파일에만 두고**, 문서에는 경로만 적는다(이중 관리 방지). 실행 결과(성공/실패 로그·고아 건수)는 §5.5 표에 한 줄 남긴다.

### 5.7 `rec_race_hist` — 레거시 자유입력·B-3 null·`race_nm` 정리 (팀 운영 합의)

**왜 `comp_id` null이 많은가**

- 과거에는 기록을 **`race_name` / `race_date` 자유 입력**으로 받았고, 지금은 앱에서 **`comp_mst` 대회 선택** 후 입력한다.
- P7 백필은 `race_nm`·`race_dt`가 **`comp_mst.comp_nm`·대회 기간과 정확히 맞을 때만** `comp_id`를 붙인다. 표기 차이·오타·날짜 오기입이 있으면 null이 정상적으로 쌓인다.
- **prd** 이관 시에도 **동일 한계**가 생긴다(자동 이관만으로는 과거 데이터 품질 문제가 사라지지 않음).

**권장 수동 정합 순서**(데이터 반영 후, 담당자 실행 — 상세는 `migration-map` §3.4)

1. `race_nm`을 **`comp_mst.comp_nm`과 일치**하도록 정리(필요 시 `race_dt` 오기입도 함께 수정).
2. **`comp_id`**를 행별로 맞춘다(재매칭·운영 스크립트).
3. **`comp_evt_id`**를 맞춘다(`comp_evt_cfg`·종목 코드 기준).
4. 정합이 안정되면 **`race_nm` 컬럼 제거**를 DDL로 검토한다. 이유: 대회명의 **단일 진실은 `comp_mst`**이고, 하위 테이블에 이름을 영구 중복 저장하는 것은 `mem_nm`을 곳곳에 두는 것과 같은 **비정규화**에 해당한다. UI·리포트는 **`comp_mst` 조인 또는 VIEW**로 “대회명”을 표현한다.

**dev vs prd (팀 합의)**

- **dev:** `rec_race_hist` 수동 정합·조회용 VIEW는 **당장 필수는 아님** — 필요할 때 맞춰도 됨.
- **prd(운영계):** 레거시 정리·수동 매칭이 **끝난 뒤**, 최종 검증에서 **`comp_id` null 행은 없어야 한다**(대회 미지정 기록을 운영에 남기지 않는다는 전제). 절차 예: B-3 집계 **0건** 확인 → **`ALTER TABLE ... ALTER COLUMN comp_id SET NOT NULL`** 등(현행 DDL은 FK만 있고 **nullable**이므로 NOT NULL은 별도 마이그레이션). `comp_evt_id`까지 필수로 할지는 팀 정책(종목 미상 기록 허용 여부)으로 재합의.

## 6) 검증 게이트 (`migration-map` 5.2·5.3)

| ID | 항목 | 목표 | 결과 (건수/메모) | 통과 |
|----|------|------|------------------|------|
| A-1 | 행 수 비교 | 기록 | | ☐ |
| A-2 | v2 누락 `mem_id` | 0건 | | ☐ |
| A-3 | 정규화 이메일 중복 | 0건 | | ☐ |
| A-4 | 정규화 전화 중복 | 0건 | | ☐ |
| B-1 | `comp_reg_rel` 누락 | 0건 | dev 2026-04-05: **0건** (MCP `execute_sql`, `competition_registration` 76건) | ☑ |
| B-2 | `rec_race_hist` 누락 | 0건 | dev 2026-04-05: **1건**(레거시 **중복 등록** → UK `mem_id+comp_evt_id+race_dt+race_nm` 충돌, `race_result_id` 1:1 불가). **prd에서도 동일 가능** — 백필 전 진단: `scripts/sql/v2_p7_race_result_uk_duplicate_list.sql` | ☐ |
| B-3 | `comp_id`/`comp_evt_id` null 집계 | dev: 리포트·null 허용. **prd: 최종 `comp_id` null 0건 목표** 후 NOT NULL 등(§5.7) | dev 2026-04-05: `comp_id` null **136**, `comp_evt_id` null **166** (정본 `rec_race_hist` 기준) | ☑(리포트) |
| C-1 | `mem_st_cd` 코드그룹 일치 | 0건 위반 | dev 2026-04-05: 위반 행 **0건** (MCP `execute_sql`) | ☑ |
| C-2 | `team_role_cd` 코드그룹 일치 | 0건 위반 | dev 2026-04-05: 위반 행 **0건** (MCP `execute_sql`) | ☑ |
| D-1/D-2 | 해시 샘플 10명 + 화면 검수 | 체크리스트 첨부 | | ☐ |

## 6.5) 레거시 v1 시점 스냅샷 — 스키마 `archive`, 테이블 `old_*` (원본 v1 DROP 전 보존)

**목적:** v1 `public` 테이블(`member`, `competition`, …)을 나중에 **물리 삭제**해도, 그 시점 데이터를 **`archive` 스키마** 아래 **`old_*` 접두 테이블**에 남긴다. `public` 목록과 섞이지 않고 Supabase Table Editor 에서 스키마 단위로 접을 수 있다.

**마이그레이션(레포, 순서):**

| 버전 | 파일 | 설명 |
|------|------|------|
| `20260404163840` | `v2_legacy_zold_snapshot.sql` | (과거) `public.zold_*` — **후속 마이그레이션에서 제거됨** |
| `20260404164840` | `archive_old_snapshot_replace_zold.sql` | **`public.zold_*` DROP** → **`archive.old_*` 생성·복제·FK 자립** |

**prd:** `zold` 를 한 번도 두지 않은 DB 는 **`64840` 만 적용**해도 된다(`DROP zold_*` 는 no-op). dev 와 동일 이력을 맞추려면 `63840` → `64840` 순으로 적용.

**버전 정합:** MCP 적용 시각과 파일명 타임스탬프가 다를 수 있다. dev `schema_migrations` 기준 확정본은 **`20260404164840`** (`rollout` §2).

### 6.5.1 적용 체크리스트

- [x] 레포: `20260404163840_v2_legacy_zold_snapshot.sql` (역사적·선행 zold)
- [x] 레포: `20260404164840_archive_old_snapshot_replace_zold.sql`
- [x] **dev:** `schema_migrations` 에 `20260404164840` · `archive.old_*` 6테이블·`public.zold_*` 없음 (2026-04-05 MCP)
- [ ] **prd:** 백업·창구 후 위 마이그레이션 세트 적용 (`cutover-checklist` §6·§8)

**적용 후 확인 SQL 예시:**

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'archive' and table_name like 'old\_%' escape '\'
order by 1, 2;
-- 기대: archive.old_competition, archive.old_competition_registration, archive.old_member,
--       archive.old_personal_best, archive.old_race_result, archive.old_utmb_profile (6행)
```

| 단계 | 내용 |
|------|------|
| 구조·데이터 | `CREATE TABLE archive.old_* (LIKE public.* INCLUDING ALL)` 후 `INSERT … SELECT` · PK 기준 `ON CONFLICT DO NOTHING` (멱등) |
| FK 정책 | 데이터 적재 후 **public** 참조 FK 제거 → **`archive.old_*` 간만** 참조(`fk_archive_old_*` 이름). |
| 접근 | 스키마 `USAGE` + 테이블 RLS ON·정책 없음, `anon`/`authenticated` REVOKE, **`service_role`만 GRANT**. |
| dev / prd | prd는 **백업·창구** 후 실행 (`cutover-checklist` §6·§8). |
| 원본 삭제 순서 | **§8** — `archive.old_*` 적재·FK 자립 확인 후에만 v1 `public` 테이블 DROP. 앱·함수·RLS 가 `member` 등을 참조하면 선행 제거. |

## 7) 애플리케이션 전환 (dev)

**상세 계획·파일 인벤토리·슬라이스 순서·prd 동일 절차:** `database-schema-v2-app-migration-plan.md`

- [ ] Supabase 타입/쿼리 경로를 v2 테이블 기준으로 변경 (도메인별 분할 가능)
- [ ] `getCurrentMember()` 등 인증·멤버 조회 경로 점검
- [ ] 회비·대회·기록 화면 스모크 테스트
- [ ] (선택) 이중 쓰기 — prd 전략 별도 문서화

## 8) 레거시 정리 (앱 v2 단일화 이후)

- [ ] v1 테이블 의존 코드·DB 함수(`is_legacy_platform_admin` 등)·RLS 정책에서의 `member` 참조 제거 확인
- [ ] **§6.5 `archive.old_*` 스냅샷** 적용 여부·행 수 스모크 확인 후에만 v1 **물리 DROP** 검토(FK 는 `archive.old_*` 간만 참조)
- [ ] v1 테이블 `legacy_` 등 prefix RENAME 또는 읽기 전용 정책(중간 단계)
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
| 2026-04-05 | §5.0a: 백필 **페이즈 분리·페이즈마다 검증** 원칙 명시; 통합 백필 파일은 참고용·신규는 페이즈별 파일 권장 | — |
| 2026-04-05 | P1: `20260404102201_v2_backfill_p1_mem_mst.sql` 추가, §5.5·진단 SQL·`schema_migrations` 정리 메모 | — |
| 2026-04-06 | §5.6 prd 컷오버: `scripts/sql/prd_cutover_mem_mst_fk_auth.sql` + FK 재부착 절차 | — |
| 2026-04-05 | P2: `20260404102202_v2_backfill_p2_team_mem_rel.sql` 추가, dev 적용·§5.5·§6 C-1/C-2 | — |
| 2026-04-05 | P3: `20260404102203_v2_backfill_p3_comp_mst.sql` 추가, dev 적용·§5.0·§5.2·§5.5 | — |
| 2026-04-05 | P4: `20260404102204_v2_backfill_p4_comp_evt_cfg.sql` 추가, dev 적용·§5.0·§5.2·§5.5 | — |
| 2026-04-05 | `20260404102205`: `comp_evt_cfg.evt_cd` → `comp_evt_cd`, 값·`cmm_cd_mst` COMP_EVT_CD 대문자 정합, `migration_v2_map_evt_cd`·`02309` 조인 갱신 | — |
| 2026-04-05 | prd 대비: `cutover-checklist` §8(prd 시행착오 재발 방지), `migration-map` §2.1 공통코드 명명 관례 문구 추가 | — |
| 2026-04-05 | P5: `20260404102206_v2_backfill_p5_team_comp_plan_rel.sql` 추가, dev 적용·§5.0·§5.2·§5.5 | — |
| 2026-04-05 | P6: `20260404102207_v2_backfill_p6_comp_reg_rel.sql` 추가, dev 적용·§5.0·§5.2·§5.5·§6 B-1 | — |
| 2026-04-05 | P7: `20260404102208_v2_backfill_p7_rec_race_hist.sql` 추가, `02309` `rec_race_hist` INSERT 에 `ON CONFLICT` 정합, dev 적용·§5.0·§5.2·§5.5·§6 B-2/B-3 | — |
| 2026-04-05 | §5.7·`migration-map` §3.4·`domains` `rec_race_hist`: 레거시 자유입력 vs 대회 선택, B-3 원인, `race_nm` 정리·제거·VIEW 노출 합의 문서화 | — |
| 2026-04-05 | §6.5: v1 시점 보존용 `zold_*` 스냅샷 — `20260404163840_v2_legacy_zold_snapshot.sql`(데이터 복제 후 FK 를 `zold_*` 간만 참조). dev MCP 적용·파일명=원격 버전 정합 | — |
| 2026-04-05 | §7: `database-schema-v2-app-migration-plan.md` 추가 — 앱 v2 슬라이스·코드 인벤토리·dev/prd 공통 검증 절차 | — |
| 2026-04-05 | §6.5: `zold_*` 는 **마이그레이션 파일만 추가된 상태**와 **원격 적용 완료**를 구분(§6.5.1 체크리스트·확인 SQL·`db push` 안내) | — |
| 2026-04-05 | §6.5: dev `zold_*` MCP 적용 완료·로컬 마이그레이션 파일 `20260404163840` 로 정합·§6.5.1 dev 체크 | — |
| 2026-04-05 | §6.5: `public.zold_*` 제거·스키마 **`archive`** + **`archive.old_*`** 로 이전 — `20260404164840_archive_old_snapshot_replace_zold.sql`, dev MCP 적용·문서·`app-migration-plan` 용어 갱신 | — |
