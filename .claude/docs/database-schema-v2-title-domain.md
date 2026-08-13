# 칭호 도메인 설계 v2

멀티팀 v2에서 칭호 도메인을 `ttl_mst`, `mem_ttl_rel` 2개 테이블로 설계한다.  
핵심 목표는 **팀 경계 정합성(FK 강제)**, **관리자 운영 편의성**, **자동/수여 칭호 공존**이다.

## 0) 진행상황 (2026-05-01)

- [x] 설계 합의 완료 (`ttl_mst`, `mem_ttl_rel`, `team_mem_id` 정합 기준)
- [x] DDL/코드시드 마이그레이션 작성
  - `supabase/migrations/20260430104000_v2_title_domain_and_common_codes.sql`
- [x] RLS 초안 마이그레이션 작성
  - `supabase/migrations/20260430105000_v2_title_domain_rls_draft.sql`
- [x] dev 반영 및 검증 SQL 통과 (테이블/enum/FK/코드/RLS 존재 확인)
- [ ] 칭호 관리 UI(`ttl_mst` CRUD) 구현
- [ ] 수여 칭호 수동 부여/회수 플로우 구현
- [ ] 자동 부여 엔진(기록 등록 시 멤버 단위 즉시 재계산) 구현

## 1) 설계 원칙
- 팀별 칭호 카탈로그는 `ttl_mst`에서 관리한다.
- 회원 보유 칭호는 `mem_ttl_rel`에서 관리한다.
- 팀-회원 정합성은 `team_mem_id` FK로 강제하고, 칭호 팀 스코프는 `team_id + ttl_id` FK로 강제한다.
- 공통 메타 컬럼은 `crt_at`, `upd_at`, `del_yn`, `vers`를 사용한다.
- `created_at`, `updated_at` 같은 표기는 사용하지 않는다.

## 2) 테이블 정의

### 2.1 `ttl_mst` (칭호 마스터)
팀별 칭호 정의 테이블. 관리자 페이지에서 생성/수정/비활성화한다.

필수 컬럼:
- `ttl_id` (PK)
- `team_id` (FK -> `team_mst`)
- `ttl_kind_enm` (enum: `auto` | `awarded`)
- `ttl_ctgr_cd` (공통코드, 코드그룹: `TTL_CTGR_CD`)
- `ttl_nm` (칭호명)
- `ttl_desc` (nullable, 설명)
- `ttl_rank` (기본 `0`, 자동 칭호 등급. 수여 칭호는 `0`)
- `cond_rule_json` (nullable, 자동 조건 JSON)
- `sort_ord` (기본 `100`, 관리자 목록 정렬 순서)
- `use_yn` (기본 `true`, 운영 사용 여부)
- `crt_by` (nullable, 생성자 `mem_id`)
- `upd_by` (nullable, 수정자 `mem_id`)
- `crt_at`, `upd_at`, `del_yn`, `vers`

권장 제약:
- `uk_ttl_mst_team_ttl_nm_vers`: (`team_id`, `ttl_nm`, `vers`)
- `uk_ttl_mst_team_ttl_id`: (`team_id`, `ttl_id`)  
  (하위 `mem_ttl_rel`의 복합 FK 참조용)
- `check_ttl_rank_non_negative`: `ttl_rank >= 0`

권장 인덱스:
- `ix_ttl_mst_team_use`: (`team_id`, `use_yn`, `del_yn`)
- `ix_ttl_mst_team_kind_ctgr`: (`team_id`, `ttl_kind_enm`, `ttl_ctgr_cd`)

운영 규칙:
- 자동 칭호(`auto`)는 카테고리 내 등급 체계를 사용한다(`ttl_rank > 0` 권장).
- 수여 칭호(`awarded`)는 관리자 수동 부여가 기본이며 `ttl_rank = 0`을 사용한다.

### 2.2 `mem_ttl_rel` (회원-칭호 관계)
회원의 칭호 보유/부여 이력 테이블.

필수 컬럼:
- `mem_ttl_id` (PK)
- `team_id` (FK 스코프)
- `team_mem_id` (FK -> `team_mem_rel.team_mem_id`)
- `ttl_id` (FK -> `ttl_mst`)
- `grnt_at` (기본 `now()`)
- `exp_at` (nullable, 수여 칭호 만료 시각)
- `grnt_by_mem_id` (nullable, 수여자 `mem_id`)
- `grnt_rsn_txt` (nullable, 부여 사유)
- `is_prmy_yn` (기본 `false`, 대표 칭호 여부)
- `crt_at`, `upd_at`, `del_yn`, `vers`

핵심 FK (정합성 강제):
- `fk_mem_ttl_rel__team_mem_rel`:  
  (`team_mem_id`) -> `team_mem_rel`(`team_mem_id`)
- `fk_mem_ttl_rel__ttl_mst`:  
  (`team_id`, `ttl_id`) -> `ttl_mst`(`team_id`, `ttl_id`)

권장 유니크:
- `uk_mem_ttl_rel_team_mem_ttl_vers`: (`team_mem_id`, `ttl_id`, `vers`)
- 대표 칭호 1건 제한(부분 유니크):
  - (`team_mem_id`) where `is_prmy_yn = true and vers = 0 and del_yn = false`

권장 인덱스:
- `ix_mem_ttl_rel_team_mem`: (`team_mem_id`, `vers`, `del_yn`)
- `ix_mem_ttl_rel_team_ttl`: (`team_id`, `ttl_id`, `vers`, `del_yn`)
- `ix_mem_ttl_rel_exp`: (`team_id`, `exp_at`) where `exp_at is not null`

트리거:
- `trg_mem_ttl_rel_promote_latest_primary` (AFTER INSERT, 2026-08-12):
  새로 수여된 칭호를 **대표(`is_prmy_yn`)로 승격**하고 이전 대표를 내린다.
  - **앱이 아니라 DB에 둔 이유**: 수여 경로가 넷이라(engine 트리거평가 · 일괄 sweep ·
    마일리지 배치 · 관리자 수동수여) 앱에서 각자 처리하면 새 경로를 추가할 때마다 조용히
    빠진다. 앱은 `is_prmy_yn`을 넘기지 않고(기본 `false`) 승격은 전적으로 이 트리거 몫이다.
  - **BEFORE가 아니라 AFTER인 이유**: bulk INSERT(sweep·배치)에서 BEFORE는 같은 명령 안의
    다른 행을 못 봐 전부 `true`로 들어가고 대표 단일성 부분 유니크에 걸린다. AFTER면 행이
    들어간 뒤 순서대로 돌아 **마지막 행이 대표로 남는다.**
  - **승격하지 않는 경우**: 회수분(`vers<>0`)·소프트삭제분, 이미 만료된 칭호(`exp_at`),
    그리고 **같은 `ttl_group_cd`에 더 높은 `rarity_level`을 보유 중일 때**(컬렉션의
    "그룹 내 최고 등급만 대표 선택 가능" 규칙과 어긋나지 않게).
  - 본인이 프로필에서 고르는 경로(`setPrimaryTitle`)와 관리자 대표 지정은 **UPDATE**라
    이 트리거에 걸리지 않는다 — 사람이 고른 값은 덮이지 않는다.

운영 규칙:
- 자동 칭호 재계산 시 카테고리별 정본(`vers=0`) 1건만 유지하고 이전 정본은 이력화(`vers>0`)한다.
- 수여 칭호 회수는 소프트삭제(`del_yn=true`) 또는 버전 이력화 방식 중 하나로 통일한다.
- 점수/상태 변경 시 UPDATE 대신 정본 교체(기존 `vers=0` -> `vers>0`, 신규 `vers=0` INSERT)를 권장한다.

## 3) 관계 요약
- `team_mst 1:N ttl_mst`
- `team_mst 1:N team_mem_rel`
- `ttl_mst 1:N mem_ttl_rel`
- `mem_mst 1:N mem_ttl_rel`
- `team_mem_rel 1:N mem_ttl_rel` (`team_mem_id` FK 기준)

핵심 보장:
- 다른 팀 칭호를 잘못 부여하는 케이스를 DB FK에서 차단한다.
- 팀 미소속 회원에게 칭호 부여를 DB FK(`team_mem_id`)에서 차단한다.

## 4) 공통코드/enum
- enum: `ttl_kind_enm` (`auto`, `awarded`)
- 공통코드 그룹: `TTL_CTGR_CD`
  - 예시 코드: `running`, `triathlon`, `trail`, `cycling`, `awarded`

## 5) 로그/이력 조회 기준 (vers 기반)
- 현재값: `vers=0 and del_yn=false`
- 이력값: `vers>0` 또는 `del_yn=true`
- 회원에게 보여줄 로그:
  - 획득 로그: `grnt_at`, `grnt_by_mem_id`, `grnt_rsn_txt`
- 운영 규칙:
  - 만료/회수는 정본 교체로 누적해 시점별 이력을 보존한다.
## 7) 관리자 페이지 고려사항
- 칭호 카탈로그 CRUD는 `ttl_mst`를 기준으로 팀 스코프에서 수행한다.
- 수여 처리 UI는 `team_id` 소속 회원 목록(`team_mem_rel`)만 선택 가능해야 한다.
- 수여/회수 감사 추적을 위해 `grnt_by_mem_id`, `grnt_rsn_txt`, `crt_by`, `upd_by`를 기록한다.

## 8) RLS 기준(초안)
- 조회: 같은 `team_id` 소속 멤버만 조회 가능.
- 생성/수정/삭제:
  - `ttl_mst`: 팀 관리자 이상만 허용.
  - `mem_ttl_rel`: 자동부여 서버 액션(서비스 롤) + 관리자 수여만 허용.
- 일반 멤버의 직접 INSERT/UPDATE/DELETE는 차단한다.
