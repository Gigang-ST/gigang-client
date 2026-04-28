# 칭호 도메인 v2 설계 (Title)

> 본 문서는 `database-schema-v2.md` (규약) / `database-schema-v2-domains.md` §5 (보류 해제분) / `database-schema-v2-member-domain.md` 의 후속 도메인 정의이며, 2026-03-23 자 `docs/design/2026-03-23-칭호시스템.md` (제품 설계서)를 v2 스키마/멀티팀 규약에 맞춰 재정리한 것이다.

## 1) 설계 원칙

- 칭호는 **팀 스코프**다. 같은 회원이라도 소속 팀별로 보유 칭호가 다를 수 있다(멀티팀 격리).
  - 예: 회원이 기강과 다른 크루에 동시 소속되어 있을 때, 각 팀의 자동 칭호 등급이 독립 계산된다.
- **자동 칭호 정의 자체도 팀별 행으로 보존한다.** 신규 팀 생성 시 표준 19개 자동 칭호를 시드한다. 운영자는 팀별로 명칭/이모지/조건을 조정할 수 있다.
- **가입일 기준**은 `team_mem_rel.join_dt`(해당 팀의 가입일)을 사용한다. 글로벌 가입일(`mem_mst.joined_at`)을 도입하지 않는다 — 멀티팀 v2 모델과 일치하지 않는다.
- 자동 칭호 재계산은 **앱 서버 레이어**(서버 액션)에서 동기 처리한다. DB 트리거는 두지 않는다(서비스 책임 명확화 + 회비/마일리지 도메인과 일관).
- **포인트는 저장하지 않는다(자동 칭호).** 조회 시점에 `활성 회원 수 / 보유자 수`로 동적 계산한다. 수여 칭호의 포인트만 저장한다.

## 2) 엔터티 정의

### `ttl_mst` (칭호 마스터)

팀별 칭호 카탈로그(자동 19종 + 수여 N종).

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `ttl_id` | `uuid` | Y | PK |
| `team_id` | `uuid` | Y | FK → `team_mst.team_id` |
| `ttl_kind_enm` | `enum` | Y | `auto` / `awarded` |
| `ttl_ctgr_cd` | `text` | Y | 공통코드 `TTL_CTGR_CD` 참조 |
| `ttl_nm` | `text` | Y | 칭호명 (예: 런린이) |
| `ttl_rank` | `int` | Y | 카테고리 내 등급. 자동 칭호 비교/정렬에 사용. 수여 칭호는 0 |
| `emoji_txt` | `text` | N | 이모지/이미지 식별자 (예: `🏃`) |
| `cond_rule` | `jsonb` | N | 자동 칭호 조건 규칙. 수여 칭호는 NULL |
| `base_pt` | `int` | N | 수여 칭호의 기본 포인트. 자동 칭호는 NULL(동적 계산) |
| `desc_txt` | `text` | N | 설명/사유 |
| `use_yn` | `boolean` | Y | 운영 사용 여부 (false면 신규 부여 중단; 기존 보유는 유지) |
| `sort_ord` | `int` | Y | 동일 카테고리/등급 내 정렬 |
| `vers` | `int` | Y | 정본 0 / 이력 >0 |
| `del_yn` | `boolean` | Y | 기본 false |
| `crt_at` | `timestamptz` | Y | now() |
| `upd_at` | `timestamptz` | Y | now() |

핵심 제약/인덱스:
- `pk_ttl_mst` (`ttl_id`)
- `fk_ttl_mst__team_mst` (`team_id` → `team_mst`)
- `uk_ttl_mst_team_kind_ctgr_rank` (`team_id`, `ttl_kind_enm`, `ttl_ctgr_cd`, `ttl_rank`, `vers`) — 자동 칭호 등급 중복 방지
- `uk_ttl_mst_team_nm` (`team_id`, `ttl_nm`, `vers`) — 팀 내 칭호명 중복 방지
- `ck_ttl_mst_auto_rank` `CHECK (ttl_kind_enm <> 'auto' OR ttl_rank >= 1)` — 자동 칭호는 등급 1 이상
- `ck_ttl_mst_awarded_rank` `CHECK (ttl_kind_enm <> 'awarded' OR ttl_rank = 0)` — 수여 칭호는 0 고정
- `ck_ttl_mst_base_pt_kind` `CHECK ((ttl_kind_enm = 'auto' AND base_pt IS NULL) OR ttl_kind_enm = 'awarded')` — 자동 칭호 base_pt 금지
- `ix_ttl_mst_team_use` (`team_id`, `use_yn`)

### `mem_ttl_rel` (회원-칭호 관계)

회원이 보유한 칭호. 자동/수여 모두 같은 테이블에 보존한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `mem_ttl_id` | `uuid` | Y | PK |
| `team_id` | `uuid` | Y | FK → `team_mst.team_id` |
| `mem_id` | `uuid` | Y | FK → `mem_mst.mem_id` |
| `ttl_id` | `uuid` | Y | FK → `ttl_mst.ttl_id` |
| `granted_at` | `timestamptz` | Y | 부여 시각 |
| `expires_at` | `timestamptz` | N | 만료 시각 (수여 칭호용; 자동은 NULL) |
| `granted_by_mem_id` | `uuid` | N | FK → `mem_mst`. 수여자(자동은 NULL) |
| `granted_pt` | `int` | N | 수여 시 입력 포인트(자동 칭호는 NULL — 동적 계산) |
| `granted_rsn_txt` | `text` | N | 수여 사유 (수여 칭호 표시용) |
| `vers` | `int` | Y | 정본 0 / 이력 >0 |
| `del_yn` | `boolean` | Y | 기본 false |
| `crt_at` | `timestamptz` | Y | now() |
| `upd_at` | `timestamptz` | Y | now() |

핵심 제약/인덱스:
- `pk_mem_ttl_rel` (`mem_ttl_id`)
- `fk_mem_ttl_rel__team_mst` / `fk_mem_ttl_rel__mem_mst` / `fk_mem_ttl_rel__ttl_mst` / `fk_mem_ttl_rel__granted_by` (모두 `ON DELETE RESTRICT`)
- `uk_mem_ttl_rel_team_mem_ttl` (`team_id`, `mem_id`, `ttl_id`, `vers`) — 동일 칭호 중복 보유 방지(이력은 `vers > 0`로 관리)
- `ck_mem_ttl_rel_expires_after_granted` `CHECK (expires_at IS NULL OR expires_at > granted_at)`
- `ck_mem_ttl_rel_granted_pt_nonneg` `CHECK (granted_pt IS NULL OR granted_pt >= 0)`
- `ix_mem_ttl_rel_team_mem` (`team_id`, `mem_id`) — 회원별 칭호 조회
- `ix_mem_ttl_rel_team_ttl` (`team_id`, `ttl_id`) — 보유자 카운트(포인트 동적 계산)

비고:
- **자동 칭호 갱신 규칙**: 자동 칭호는 카테고리 내 최상위 1개만 보유한다. 재계산 시 같은 (team_id, mem_id, category)의 기존 정본 행을 `vers > 0`로 이력화하고 새 정본 1건을 INSERT한다. (회비 도메인의 워터마크 정본/이력 패턴과 동일 원칙)
- **수여 칭호 복수 보유**: "맛객"을 두 번 받는 케이스는 새 정본 행을 만드는 게 아니라, 기존 정본을 expires_at으로 종료하거나 갱신한다(같은 ttl_id 정본 중복 금지 제약). 동일 칭호의 새 기간이 필요하면 기존 정본 만료 후 새 정본 INSERT.
- **만료 처리**: `expires_at`은 데이터 보존용. 화면에서는 `expires_at IS NULL OR expires_at > now()` 필터로 표시.

## 3) 코드 그룹

### `cmm_cd_grp_mst` 추가

| `cd_grp_cd` | 설명 |
|-------------|------|
| `TTL_CTGR_CD` | 칭호 카테고리 |

### `TTL_CTGR_CD` 코드값

| `cd` | `cd_nm` | 의미 |
|------|---------|------|
| `running` | 러닝 | 도로 러닝 PB 기반 자동 칭호 |
| `triathlon` | 철인 | 철인3종 완주 기반 자동 칭호 |
| `trail` | 트레일 | 트레일러닝 완주 기반 자동 칭호 |
| `cycling` | 사이클 | 자전거 완주 기반 자동 칭호 |
| `awarded` | 수여 | 기강단장 수여 (`ttl_kind_enm = 'awarded'`) |

> **enum vs 공통코드:** v2 §10.2 원칙대로 운영에서 추가/이름변경 가능성이 있는 카테고리는 공통코드(`*_cd`)로 관리한다. `ttl_kind_enm`(auto/awarded)은 코드셋이 작고 안정적이므로 PostgreSQL enum으로 둔다.

## 4) 자동 칭호 조건 표현 (`ttl_mst.cond_rule`)

조건은 jsonb로 표현하며 서비스 레이어가 해석한다. 현재 사용 타입은 4종.

### 4.1 `join_age` — 가입 기간 기반

```jsonc
{ "type": "join_age", "max_months": 3 }   // 가입 3개월 이하
{ "type": "join_age", "min_months": 3 }   // 가입 3개월 초과
```

기준: `team_mem_rel.join_dt` (해당 팀 정본 행의 가입일).

### 4.2 `pb` — 개인 최고기록 시간 기준

```jsonc
{
  "type": "pb",
  "sprt": "road_run",
  "evt_type": "FULL",
  "max_sec": 18000
}
```

평가:
1. `rec_race_hist` 중 `mem_id` 일치, `del_yn = false`
2. `comp_evt_cfg` → `comp_mst.comp_sprt_cd` = `sprt`, `comp_evt_cfg.comp_evt_type` = `evt_type`
3. `race_dt >= team_mem_rel.join_dt`
4. `min(rec_time_sec) <= max_sec` 이면 충족

### 4.3 `finish` — 완주 기록 존재 여부

```jsonc
{
  "type": "finish",
  "sprt": "triathlon",
  "evt_type": "OLYMPIC"
}
```

평가: 4.2와 동일 조건이되 시간 비교 없이 1건 이상 존재 여부만 판정.

### 4.4 `finish_any` — 카테고리 입문 (트레일 1등급용)

```jsonc
{
  "type": "finish_any",
  "sprt": "trail_run"
}
```

평가: `comp_sprt_cd = 'trail_run'` 인 어떤 종목이든 1건 이상 완주 기록 존재.

> **트레일/울트라 구분**: 기존 우려(설계서 §3 백엔드 참고)는 `comp_mst.comp_sprt_cd`(2026-04-21 추가 `ultra` 포함)로 해소되었다. `rec_race_hist`에 별도 `sport` 컬럼을 두지 않고 `rec_race_hist → comp_evt_cfg → comp_mst` 조인으로 구분한다.

## 5) 자동 칭호 카탈로그 (시드)

신규 팀 생성 시 아래 19행을 `ttl_mst`에 INSERT한다. `team_id`만 다르고 정의는 동일하다.

### 5.1 러닝 (`ttl_ctgr_cd = 'running'`)

| `ttl_rank` | `ttl_nm` | `cond_rule` |
|------------|----------|-------------|
| 1 | 런린이 | `{"type":"join_age","max_months":3}` |
| 2 | 입문 | `{"type":"join_age","min_months":3}` |
| 3 | 초보 | `{"type":"pb","sprt":"road_run","evt_type":"10K","max_sec":3600}` |
| 4 | 중수 | `{"type":"pb","sprt":"road_run","evt_type":"HALF","max_sec":7200}` |
| 5 | 고수 | `{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":18000}` |
| 6 | 고인물 | `{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":14400}` |
| 7 | 신세계 | `{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":12600}` |
| 8 | 천상천하유아독존 | `{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":11400}` |
| 9 | 최고존엄 | `{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":10800}` |

평가 규칙: 등급 9→1 순으로 평가하여 처음 충족하는 등급 채택. 단 1·2(런린이/입문)는 가입 기간만으로 결정되며 상위 미충족 시 폴백.

### 5.2 철인 (`ttl_ctgr_cd = 'triathlon'`)

| `ttl_rank` | `ttl_nm` | `cond_rule` |
|------------|----------|-------------|
| 1 | 올림픽 철인 | `{"type":"finish","sprt":"triathlon","evt_type":"OLYMPIC"}` |
| 2 | 하프철인 | `{"type":"finish","sprt":"triathlon","evt_type":"HALF"}` |
| 3 | 킹철인 | `{"type":"finish","sprt":"triathlon","evt_type":"FULL"}` |

### 5.3 트레일 (`ttl_ctgr_cd = 'trail'`)

| `ttl_rank` | `ttl_nm` | `cond_rule` |
|------------|----------|-------------|
| 1 | 동네언덕 | `{"type":"finish_any","sprt":"trail_run"}` |
| 2 | 뒷산 | `{"type":"finish","sprt":"trail_run","evt_type":"20K"}` |
| 3 | 산악구보 | `{"type":"finish","sprt":"trail_run","evt_type":"50K"}` |
| 4 | 산악대장 | `{"type":"finish","sprt":"trail_run","evt_type":"100K"}` |
| 5 | 산신령 | `{"type":"finish","sprt":"trail_run","evt_type":"100M"}` |

### 5.4 자전거 (`ttl_ctgr_cd = 'cycling'`)

| `ttl_rank` | `ttl_nm` | `cond_rule` |
|------------|----------|-------------|
| 1 | 메디오폰도 | `{"type":"finish","sprt":"cycling","evt_type":"MEDIOFONDO"}` |
| 2 | 그란폰도 | `{"type":"finish","sprt":"cycling","evt_type":"GRANFONDO"}` |

> **선결 마이그레이션**: `CYC_EVT_CD`에 `MEDIOFONDO` 추가 필요. 별도 마이그레이션 파일로 분리(2026-03-23 설계서 §4 “백엔드 참고”).

## 6) 수여 칭호 (`ttl_kind_enm = 'awarded'`)

- 시드 권장(기강 팀): 서브현근 / 행동대장 / 맛객 — `base_pt`는 운영 합의 후 시드. 기강단장(소유자)은 `team_mem_rel.team_role_cd = 'owner'` 와 의미가 겹치므로 칭호로 별도 유지하지 않는 것을 1차 권장하되, 화면 표시를 위해 시드할 수도 있음(오픈 이슈).
- 운영자가 임의 추가/수정 가능. 카테고리 = `awarded`, `ttl_rank = 0`.
- 수여 시 `mem_ttl_rel.granted_pt`, `expires_at`, `granted_rsn_txt`, `granted_by_mem_id` 입력.

## 7) 포인트 계산

### 7.1 자동 칭호 (동적)

```sql
-- 보유자 수
WITH holders AS (
  SELECT ttl_id, COUNT(*) AS holder_cnt
  FROM mem_ttl_rel
  WHERE team_id = :team_id AND vers = 0 AND del_yn = false
    AND (expires_at IS NULL OR expires_at > now())
  GROUP BY ttl_id
),
-- 활성 회원 수 (팀)
active_cnt AS (
  SELECT COUNT(*) AS n
  FROM team_mem_rel
  WHERE team_id = :team_id
    AND vers = 0 AND del_yn = false
    AND mem_st_cd = 'active'
)
SELECT
  ttl_id,
  CASE WHEN h.holder_cnt = 0 THEN 0
       ELSE GREATEST(1, FLOOR(a.n::numeric / h.holder_cnt))::int
  END AS dynamic_pt
FROM holders h CROSS JOIN active_cnt a;
```

- 0 보유자는 노출되지 않으므로 결과에 빠진다.
- `floor(...)`로 정수화하되 최저 1점 보장.

### 7.2 수여 칭호 (정적)

`mem_ttl_rel.granted_pt` 값을 그대로 사용. NULL이면 0 처리.

### 7.3 회원 총 포인트

`SUM(dynamic_pt) + SUM(granted_pt)` (만료된 칭호 제외).

뷰 또는 RPC 제공: `get_team_member_title_points(p_team_id uuid)`.

## 8) 재계산 정책

| 트리거 | 처리 |
|--------|------|
| `rec_race_hist` 등록/수정/삭제 | 해당 (mem_id, team_id) 자동 칭호 4 카테고리 재계산 |
| `team_mem_rel` 신규 정본 INSERT (가입) | 러닝 카테고리(런린이) 부여 |
| 가입 3개월 경과 (런린이→입문) | 별도 배치 없이, 자동 칭호 재계산은 위 트리거 + 야간 배치 1회로 충분(오픈 이슈) |
| 수여 칭호 등록/수정 | 단일 행 INSERT, 재계산 불필요 |
| 수여 칭호 만료 | 만료 시각 도래 시 표시 자동 제외 (배치 불필요) |

자동 칭호 재계산 함수(서버 액션):
```ts
recomputeAutoTitles(teamId: string, memId: string): Promise<void>
```
- 4개 카테고리 각각에 대해 등급 9→1 평가, 첫 충족 등급 채택
- 기존 정본 행이 같은 ttl_id면 no-op, 다른 ttl_id면 이력화 후 정본 교체

## 9) RLS 원칙

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `ttl_mst` | 같은 팀 멤버 | 팀 owner/admin | 팀 owner/admin | 금지(soft delete) |
| `mem_ttl_rel` | 같은 팀 멤버 | 자동 칭호: 서비스 롤(서버 액션) / 수여 칭호: 팀 owner/admin | 팀 owner/admin (자동 칭호 갱신은 서비스 롤) | 금지(soft delete + vers) |

- "같은 팀 멤버" 검증은 회원 도메인과 동일한 `SECURITY DEFINER` 헬퍼(`is_team_member`, `is_team_admin` 등) 재사용.
- 자동 칭호 INSERT는 일반 멤버 권한으로 막고 서버 액션(서비스 롤)에서만 수행 — 회원이 자기 칭호를 임의 부여 못하도록.

## 10) 관계 요약

- `team_mst 1:N ttl_mst`
- `team_mst 1:N mem_ttl_rel`
- `mem_mst 1:N mem_ttl_rel`
- `ttl_mst 1:N mem_ttl_rel`
- `mem_mst 1:N mem_ttl_rel` (via `granted_by_mem_id`)

## 11) 화면 표시 규약 (요약)

DB 모델과 직접 관련 있는 부분만 정리. 화면 디테일은 `docs/design/2026-03-23-칭호시스템.md` §이름 표시 규칙 참조.

- 표시 순서: 자동 칭호 이모지 → 수여 칭호 뱃지(이름)
- 정렬: 포인트 내림차순
- 자세히 보기: 보유 칭호 전체 목록(만료 표시 포함)
- 이름 이펙트는 본 문서의 범위 밖(디자인팀 협의)

## 12) 오픈 이슈

1. **기강단장 칭호 별도 유지 여부**: `team_mem_rel.team_role_cd = 'owner'`와 의미 중복. 칭호로 두지 않고 역할 코드 기반 표시로 대체할지 결정 필요.
2. **포인트 동점 시 정렬**: 자동 칭호 동적 점수가 같을 경우 `ttl_rank` 우선? `granted_at` 우선?
3. **칭호 정의 변경 시 보유자 처리**: 운영자가 `cond_rule` 변경하면 기존 보유자는? — 현 설계는 다음 재계산까지 유지. 즉시 재계산 RPC 제공 여부.
4. **이름 이펙트 데이터화**: 카테고리별 이펙트 정의를 ttl_mst에 둘지, 카테고리 코드 메타에 둘지(공통코드 `cd_desc` 활용 등).
5. **수여 칭호 시드**: 기강 팀에 어떤 수여 칭호를 사전 등록할지(서브현근/행동대장/맛객/추가).

## 13) 마이그레이션 파일 분리(예정)

도메인 문서 §8 작성 규칙(생성/백필/인덱스/RLS/롤백) 적용. 파일 순:

1. `2026MMDDHHMMSS_cyc_evt_cd_mediofondo.sql` — `CYC_EVT_CD`에 `MEDIOFONDO` 추가 (선결)
2. `2026MMDDHHMMSS_ttl_ctgr_cd_group.sql` — `TTL_CTGR_CD` 코드그룹/코드 시드
3. `2026MMDDHHMMSS_ttl_kind_enm.sql` — enum 생성
4. `2026MMDDHHMMSS_ttl_mst.sql` — 테이블/제약/인덱스/RLS
5. `2026MMDDHHMMSS_mem_ttl_rel.sql` — 테이블/제약/인덱스/RLS
6. `2026MMDDHHMMSS_ttl_mst_seed_gigang_auto.sql` — 기강 팀 자동 칭호 19종 시드
7. (선택) `2026MMDDHHMMSS_ttl_mst_seed_gigang_awarded.sql` — 수여 칭호 초기 시드

각 파일은 v2 §8 규약대로 1) 생성, 2) 백필, 3) 인덱스/제약, 4) RLS, 5) 롤백 섹션을 포함한다.
