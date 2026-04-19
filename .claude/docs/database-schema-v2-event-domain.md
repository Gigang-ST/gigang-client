# 이벤트 도메인 v2 설계 (마일리지런)

## 1) 설계 배경
- 팀 단위로 운영하는 이벤트/프로젝트(마일리지런, 동계훈련 등)를 관리한다.
- 참여 신청 → 관리자 승인 → 기록 입력 → 목표 자동 상향 → 환급/회식비 계산 흐름을 지원한다.
- 배율 이벤트(우중런, 모임 등)는 기간 한정 또는 상시로 운영하며, 기록 입력 시점의 배율을 jsonb 스냅샷으로 보존한다.
- 목표는 참가 신청 시 전체 월 일괄 생성하고, 기록 변경 시 연쇄 재계산한다.

## 2) 엔터티 관계

```
team_mst (1) ──< evt_team_mst (N)
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
  evt_team_prt_rel  evt_mlg_mult_cfg
  (참여 관계)       (배율 설정)
         │
    ┌────┴────┐
    ▼         ▼
evt_mlg_goal_cfg  evt_mlg_act_hist
(월별 목표)       (활동 기록, applied_mults jsonb)
```

## 3) 엔터티 정의

### `evt_team_mst` (팀 이벤트 마스터)
팀 단위 이벤트/프로젝트의 기본 정보를 관리한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `evt_id` | `uuid` | Y | PK |
| `team_id` | `uuid` | Y | FK → `team_mst.team_id` |
| `evt_nm` | `varchar(100)` | Y | 이벤트명 (ex: 2026 마일리지런) |
| `evt_type_cd` | `varchar(20)` | Y | 이벤트 유형 코드 (`MILEAGE_RUN` 등) |
| `stt_dt` | `date` | Y | 시작일 |
| `end_dt` | `date` | Y | 종료일 |
| `status_cd` | `varchar(20)` | Y | 상태 (`READY` / `ACTIVE` / `CLOSED`), 기본값 `READY` |
| `desc` | `text` | N | 설명 |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `evt_id`
- FK: `team_id` → `team_mst(team_id)`

### `evt_team_prt_rel` (이벤트 참여 관계)
회원의 이벤트 참여 신청 및 승인 상태를 관리한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `prt_id` | `uuid` | Y | PK |
| `evt_id` | `uuid` | Y | FK → `evt_team_mst.evt_id` |
| `mem_id` | `uuid` | Y | FK → `mem_mst.mem_id` |
| `stt_month` | `date` | Y | 참여 시작월 (ex: `2026-04-01`). 연습기간 가입이면 연습월부터 |
| `init_goal` | `integer` | Y | 초기 목표 마일리지 (50/100/자유) |
| `deposit_amt` | `integer` | Y | 보증금 (잔여 실전 개월 × 1만원) |
| `entry_fee_amt` | `integer` | Y | 참가비 (싱글렛 보유: 1만, 미보유: 2만) |
| `singlet_fee_amt` | `integer` | Y | 싱글렛비 (현재 미사용, 0 고정) |
| `has_singlet_yn` | `boolean` | Y | 싱글렛 보유 여부, 기본값 `false` |
| `approve_yn` | `boolean` | Y | 운영진 승인 여부, 기본값 `false` |
| `approved_at` | `timestamptz` | N | 승인 일시 |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `prt_id`
- FK: `evt_id` → `evt_team_mst(evt_id)`, `mem_id` → `mem_mst(mem_id)`
- UK: `(evt_id, mem_id)` — 한 이벤트에 한 회원 1회 참여

### `evt_mlg_goal_cfg` (마일리지 월별 목표 설정)
회원의 월별 마일리지 목표를 관리한다. 참가 신청 시 시작월~종료월까지 init_goal로 일괄 생성되며, 기록 추가/수정/삭제 시 연쇄 재계산된다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `goal_id` | `uuid` | Y | PK |
| `evt_id` | `uuid` | Y | FK → `evt_team_mst.evt_id` |
| `mem_id` | `uuid` | Y | FK → `mem_mst.mem_id` |
| `goal_month` | `date` | Y | 대상월 (ex: `2026-05-01`) |
| `goal_val` | `integer` | Y | 목표 마일리지 (정수) |
| `achieved_yn` | `boolean` | Y | 달성 여부, 기본값 `false` |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `goal_id`
- FK: `evt_id` → `evt_team_mst(evt_id)`, `mem_id` → `mem_mst(mem_id)`
- UK: `(evt_id, mem_id, goal_month)` — 이벤트 × 회원 × 월 유일

목표 자동상향 규칙 (연습기간 제외, 실전 기간만):
- 달성 시: 목표 < 50 → +10, 50~99 → +15, 100+ → +20
- 미달성 시: 유지

### `evt_mlg_act_hist` (마일리지 활동 기록)
회원의 개별 운동 기록. 배율 적용 내역은 `applied_mults` jsonb 스냅샷으로 보존한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `act_id` | `uuid` | Y | PK |
| `evt_id` | `uuid` | Y | FK → `evt_team_mst.evt_id` |
| `mem_id` | `uuid` | Y | FK → `mem_mst.mem_id` |
| `act_dt` | `date` | Y | 활동 날짜 |
| `sport_cd` | `varchar(20)` | Y | 종목 (`RUNNING` / `TRAIL` / `CYCLING` / `SWIMMING`) |
| `distance_km` | `numeric(6,2)` | Y | 거리 (km) |
| `elevation_m` | `numeric(7,1)` | N | 상승고도 (m), 수영은 null |
| `base_mlg` | `numeric(6,2)` | Y | 기본 마일리지 (배율 적용 전) |
| `applied_mults` | `jsonb` | N | 적용 배율 스냅샷 `[{"mult_id", "mult_nm", "mult_val"}]` |
| `final_mlg` | `numeric(6,2)` | Y | 최종 마일리지 (배율 적용 후) |
| `review` | `text` | N | 한 줄 후기 |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `act_id`
- FK: `evt_id` → `evt_team_mst(evt_id)`, `mem_id` → `mem_mst(mem_id)`

마일리지 계산 공식:
- 러닝/트레일: `distance_km + elevation_m / 100`
- 자전거: `distance_km / 4 + elevation_m / 100`
- 수영: `distance_km × 3`
- 최종: `base_mlg × mult_val1 × mult_val2 × ...`

### `evt_mlg_mult_cfg` (마일리지 이벤트 배율 설정)
운영진이 관리하는 배율 마스터. 기간 한정 또는 상시 적용.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `mult_id` | `uuid` | Y | PK |
| `evt_id` | `uuid` | Y | FK → `evt_team_mst.evt_id` |
| `mult_nm` | `varchar(100)` | Y | 배율명 (ex: 비 올 때) |
| `mult_val` | `numeric(3,2)` | Y | 배율값 (ex: 1.20) |
| `stt_dt` | `date` | N | 시작일 (null = 상시) |
| `end_dt` | `date` | N | 종료일 (null = 상시) |
| `active_yn` | `boolean` | Y | 활성 여부, 기본값 `true` |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `mult_id`
- FK: `evt_id` → `evt_team_mst(evt_id)`

## 4) RLS 정책

| 테이블 | 정책 | 조건 |
|--------|------|------|
| 전체 5개 테이블 | SELECT | `authenticated` 사용자 전체 허용 (`using (true)`) |
| 전체 5개 테이블 | INSERT/UPDATE/DELETE | RLS 정책 없음 — `createAdminClient()` (service role) 경유로만 쓰기 가능 |

## 5) 비즈니스 규칙

### 참가비 구조
- 보증금: 잔여 실전 개월 × 1만원 (연습기간 제외)
- 참가비: 2만원 (싱글렛 보유 시 1만원)
- 회식비 풀에는 참가비 중 1만원/인만 포함 (싱글렛비 별도)

### 날짜 잠금
- 당월 기록: 자유
- 전월 기록: 매월 3일까지 (admin 우회)
- 2개월 이전: 불가 (admin 우회)
- 미래 날짜: 불가
- 목표 수정: 14일까지, 상향만 (admin 우회)

### 환급/회식비
- 월 환급률 = min(달성 마일리지 / 목표, 1.0)
- 월 환급액 = 환급률 × 1만원
- 회식비 풀 = (보증금 합 - 환급 합) + 참가비(1만/인 고정)
- 1인 상한 = 풀 × (본인 참여개월 / 전체 참여개월 합)
