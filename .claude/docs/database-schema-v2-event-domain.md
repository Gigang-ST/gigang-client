# 이벤트 도메인 v2 설계 (마일리지런 · PB 클래스)

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
evt_mlg_mth_snap  evt_mlg_act_hist
(월별 스냅샷)      (활동 기록, aply_mults jsonb)
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
| `stts_enm` | `evt_stts_enm` | Y | 상태 enum (`READY` / `ACTIVE` / `CLOSED`), 기본값 `READY` |
| `desc_txt` | `text` | N | 설명 |
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
| `stt_mth` | `date` | Y | 참여 시작월 (ex: `2026-04-01`). 연습기간 가입이면 연습월부터 |
| `init_goal` | `integer` | Y | 초기 목표 마일리지 (50/100/자유) |
| `deposit_amt` | `integer` | Y | 보증금 (잔여 실전 개월 × 1만원) |
| `entry_fee_amt` | `integer` | Y | 참가비 (싱글렛 보유: 1만, 미보유: 2만) |
| `singlet_fee_amt` | `integer` | Y | 싱글렛비 (현재 미사용, 0 고정) |
| `has_singlet_yn` | `boolean` | Y | 싱글렛 보유 여부, 기본값 `false` |
| `aprv_yn` | `boolean` | Y | 운영진 승인 여부, 기본값 `false` |
| `aprv_at` | `timestamptz` | N | 승인 일시 |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `prt_id`
- FK: `evt_id` → `evt_team_mst(evt_id)`, `mem_id` → `mem_mst(mem_id)`
- UK: `(evt_id, mem_id)` — 한 이벤트에 한 회원 1회 참여

### `evt_mlg_mth_snap` (마일리지 월별 스냅샷)
회원의 월별 목표와 집계 스냅샷을 함께 관리한다. 참가 신청 시 시작월~종료월까지 init_goal로 일괄 생성되며, 기록 추가/수정/삭제 시 연쇄 재계산된다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `goal_id` | `uuid` | Y | PK |
| `prt_id` | `uuid` | Y | FK → `evt_team_prt_rel.prt_id` |
| `base_dt` | `date` | Y | 기준월 (ex: `2026-05-01`) |
| `goal_mlg` | `integer` | Y | 목표 마일리지 (정수) |
| `achv_yn` | `boolean` | Y | 월 목표 달성 여부, 기본값 `false` |
| `act_cnt` | `integer` | Y | 해당 월 활동 건수, 기본값 `0` |
| `achv_mlg` | `numeric(8,2)` | Y | 해당 월 누적 마일리지, 기본값 `0` |
| `lst_act_dt` | `date` | N | 해당 월 마지막 활동일 |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `goal_id`
- FK: `prt_id` → `evt_team_prt_rel(prt_id)`
- UK: `(prt_id, base_dt)` — 참여자 × 기준월 유일

목표 자동상향 규칙 (연습기간 제외, 실전 기간만):
- 달성 시: 목표 <= 50 → +10, 50 초과~100 미만 → +15, 100 이상 → +20
- 미달성 시: 유지

### `evt_mlg_act_hist` (마일리지 활동 기록)
회원의 개별 운동 기록. 배율 적용 내역은 `aply_mults` jsonb 스냅샷으로 보존한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `act_id` | `uuid` | Y | PK |
| `prt_id` | `uuid` | Y | FK → `evt_team_prt_rel.prt_id` |
| `act_dt` | `date` | Y | 활동 날짜 |
| `sprt_enm` | `evt_mlg_sprt_enm` | Y | 종목 enum (`RUNNING` / `TRAIL` / `CYCLING` / `SWIMMING`) |
| `dst_km` | `numeric(6,2)` | Y | 거리 (km) |
| `elv_m` | `numeric(7,1)` | N | 상승고도 (m), 수영은 null |
| `base_mlg` | `numeric(6,2)` | Y | 기본 마일리지 (배율 적용 전) |
| `aply_mults` | `jsonb` | N | 적용 배율 스냅샷 `[{"mult_id", "mult_nm", "mult_val"}]` |
| `final_mlg` | `numeric(6,2)` | Y | 최종 마일리지 (배율 적용 후) |
| `review` | `text` | N | 한 줄 후기 |
| `created_at` | `timestamptz` | Y | 기본값 `now()` |
| `updated_at` | `timestamptz` | Y | 기본값 `now()` |

핵심 제약:
- PK: `act_id`
- FK: `prt_id` → `evt_team_prt_rel(prt_id)`

마일리지 계산 공식:
- 러닝/트레일: `dst_km + elv_m / 100`
- 자전거: `dst_km / 4 + elv_m / 100`
- 수영: `dst_km × 3`
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

---

## 6) PB 클래스 (`evt_type_cd = 'PB_CLASS'`, 2026-10-07 · #577)

출석 기반 프로젝트. 마일리지런이 「각자 뛴 거리」로 환급했다면 PB 클래스는 「공식훈련 벙에 나온 횟수」로
환급한다. 설계·화면의 정본은 `docs/design/2026-10-07-겨울10K-PB클래스.md`, 금전 계산은 `lib/pb-class.ts` 한 곳.

```
evt_team_mst (evt_type_cd='PB_CLASS')
   ├── evt_pb_cfg      (1:1 설정)
   ├── evt_pb_prt_rel  (참가자 — 마일리지 evt_team_prt_rel 과 분리)
   └── evt_gthr_rel ──> gthr_mst ──< gthr_attd_rel   (출석 = 연결된 벙의 참석)
```

| 테이블 | 핵심 컬럼 | 제약 |
|---|---|---|
| `evt_pb_cfg` | `tot_sess_cnt`(13) · `full_rfnd_attd_cnt`(9) · `late_join_wk_no`(6) · `deposit_amt`(30000) · `entry_fee_amt`(10000) | PK `evt_id`(CASCADE), `full ≤ tot` |
| `evt_pb_prt_rel` | `join_wk_no` · `deposit_amt` · `entry_fee_amt` · `aprv_yn` · `aprv_at` | UNIQUE(`evt_id`,`mem_id`) |
| `evt_gthr_rel` | `wk_no`(**주차**, 회차 아님) · `sess_type_cd`(`TRAINING`/`MEASURE`) | PK `gthr_id`(벙 하나는 프로젝트 하나에만), UNIQUE(`evt_id`,`wk_no`), 측정은 프로젝트당 1(부분 유니크) |

- **참가자를 `evt_team_prt_rel`에 넣지 않는 이유**: 그 테이블을 타입 구분 없이 읽는 곳이 있다 — 칭호
  `mileage_joined`(행이 하나라도 있으면 수여), 칭호 스냅샷(`mem_id` 단일 키), MCP 마일리지 참가 해석
  (기간 중 이벤트 우선 → PB 참가를 마일리지로 집는다). 분리하면 마일리지 코드가 PB 행을 구조적으로 못 본다.
- **`evt_team_mst`는 공유한다** → "팀의 ACTIVE 이벤트"를 읽는 코드는 **타입 필터**(`evt_type_cd`)를 건다.
  ACTIVE가 둘 이상일 수 있다(마일리지 정산 중에 PB 모집). `.maybeSingle()`로 하나를 가정하면 에러가 난다.
- `wk_no`는 서버가 벙 `stt_at`에서 계산해 저장한다(W1 = 프로젝트 `stt_dt` 수요일, 수 00:00 KST 경계).
- RLS: 세 테이블 모두 SELECT = **같은 팀 멤버**(`v2_rls_auth_in_team`), 쓰기는 service role. 마일리지 테이블의
  `USING (true)`(전 팀 공개)는 따르지 않았다.

### 규칙
- 출석 = 연결된 벙 중 **삭제 안 됐고 시작 시각이 지난** 벙의 `gthr_attd_rel` + **합류 주차 이후**만.
  `gthr_attd_rel`은 미래 벙의 참석 예약까지 담으므로 시작 전 벙을 세면 안 된다.
- 전액 기준 = `floor(남은 회차 × full ÷ tot)`, 남은 회차 = `tot − (join_wk_no − 1)` — **연결된 벙 수를 세지 않는다**
  (한파 취소로 연결이 빠져도 분모 고정). `join_wk_no ≥ late_join_wk_no`면 환급 없음(보증금 0).
- 환급 = `floor(참가자.deposit_amt × min(출석, 기준) ÷ 기준)`.

### 2·3단계 테이블 (`20261007130000_evt_pb_class_game.sql`)

| 테이블/컬럼 | 핵심 | 제약 |
|---|---|---|
| `evt_pb_cfg.rule_json` | 배점·목표 규칙 jsonb — 앱이 `PB_DEFAULT_RULE`과 병합 | NOT NULL DEFAULT `{}` |
| `evt_pb_grp_mst` | 게임팀 `grp_nm` · `color_no`(1~5) · `sort_ord` | UNIQUE(`evt_id`,`grp_nm`), CASCADE |
| `evt_pb_prt_rel` + | `trn_grp_cd`(A~E) · `grp_id`(→게임팀, SET NULL) · `goal_sec`(1200~7200) | |
| `evt_pb_rec_hist` | `rec_type_cd`(BASE_5K/MID_5K/FINAL_10K/DAEGU_10K) · `rec_sec` · `cnfm_yn`(늘 true — 회원이 직접 올린다) · `crt_by` | UNIQUE(`prt_id`,`rec_type_cd`) |
| ~~`evt_pb_msn_mst` / `evt_pb_msn_rslt_rel`~~ | 팀 미션 — **오너 지시로 삭제**(`20261007150000_evt_pb_class_drop_mission.sql`) | |

- **점수는 테이블이 없다** — `lib/pb-class-score.ts`가 벙·참석·기록에서 매번 계산한다(장부를 두면 원천과 갈라진다).

### 다듬기 (`20261007140000_evt_pb_class_polish.sql`)

| 테이블/컬럼 | 내용 |
|---|---|
| `evt_pb_cfg.mlg_dc_amt` | 마일리지런 참가자 보증금 할인액(기본 5,000) |
| `evt_pb_prt_rel.deposit_dc_amt` | 신청 때 적용된 할인. `deposit_amt`는 할인 **뒤** 실제 보증금 — 환급은 이 값 기준 |
| `evt_pb_sess_plan` | 회차별 훈련표 PK(`evt_id`,`sess_no`). `sess_no` 1~(N−1) = 그 주차 공식훈련, N = 10K 측정. 단계·제목·A~D·E·목적·비고 |

- PB `end_dt`는 서버가 `pbEndDtFor(stt_dt, cfg)`로 정한다(클라이언트 값 무시).
- 프로젝트 삭제는 참가자(마일리지·PB)가 하나라도 있으면 거부 — 끝난 프로젝트는 `CLOSED`로 보관한다.

### 훈련표 개편 (`20261008100000_evt_pb_sess_plan_kind.sql`)
- `evt_pb_sess_plan`: **`phase_nm`·`purp_txt` 삭제**, `trn_kind_cd`(TT·SPD·HILL·THR·VO2·RACE·FART·TAPER, NOT NULL) · `self_trn_txt`(개인 훈련 안내, NULL) 추가.
  종류 이름·속도·기르는 것은 코드 사전(`PB_TRN_KINDS`, `lib/pb-class-plan.ts`)이 정본이고 DB엔 코드만 둔다.
