# v2 마이그레이션 매핑 가이드 (AS-IS -> v2)

## 1) 목적/범위
- 본 문서는 **전환 작업(마이그레이션)** 전용 문서다.
- 스키마 설계 원칙은 `database-schema-v2*.md`를 기준으로 하고, 본 문서는
  - AS-IS 테이블/컬럼
  - v2 대상 테이블/컬럼
  - 값 변환 규칙/검증 포인트
  를 정의한다.

참조 문서:
- AS-IS: `database-schema.md`
- v2 규약: `database-schema-v2.md`
- v2 회원: `database-schema-v2-member-domain.md`
- v2 도메인(대회/기록/회비): `database-schema-v2-domains.md`
- 컷오버 체크: `database-schema-v2-cutover-checklist.md`

## 2) 전환 공통 규칙
- 대상 환경: `supabase-gigang-dev`만 사용
- 기본 원칙:
  - 정본/이력 규칙이 필요한 테이블은 v2 `vers` 정책 준수
  - 소프트삭제 기본(`del_yn=false`)
  - 시간 컬럼은 가능한 한 timezone 손실 없이 변환
- 코드/enum:
  - `*_cd`는 공통코드 값으로 매핑
  - `*_enm`은 enum 값셋으로 매핑

## 2.1 공통코드 시드(필수)
`*_cd` 컬럼이 참조할 공통코드는 마이그레이션에서 **테이블 생성과 함께 기본 시드 데이터로 등록**한다.

### 코드그룹-컬럼 매핑
| 컬럼 | 코드그룹(`cd_grp_cd`) | 기본 코드 예시 |
|---|---|---|
| `team_mem_rel.mem_st_cd` | `MEM_ST_CD` | `active`, `inactive`, `pending`, `left`, `banned` |
| `team_mem_rel.team_role_cd` | `TEAM_ROLE_CD` | `owner`, `admin`, `member` |
| `comp_mst.comp_sprt_cd` | `COMP_SPRT_CD` | `road_run`, `trail_run`, `triathlon`, `cycling` |
| `comp_evt_cfg.evt_cd` | `COMP_EVT_CD` | `5k`, `10k`, `half`, `full`, `50k`, `100k`, `100m` |
| `comp_reg_rel.prt_role_cd` | `PRT_ROLE_CD` | `participant`, `cheering`, `volunteer` |
| `rec_race_hist.rec_src_cd` | `REC_SRC_CD` | `manual`, `imported`, `api` |
| `fee_xlsx_upd_hist.upd_st_cd` | `FEE_UPD_ST_CD` | `pending`, `confirmed`, `rolled_back` |
| `fee_txn_hist.match_st_cd` | `FEE_TXN_MATCH_ST_CD` | `matched`, `unmatched`, `ambiguous` |
| `fee_txn_hist.fee_item_cd` | `FEE_ITEM_CD` | `due`, `expense`, `event_fee`, `goods`, `other` |
| `fee_due_pay_hist.pay_st_cd` | `FEE_PAY_ST_CD` | `paid`, `cancelled`, `refunded` |

시드 순서:
1. `cmm_cd_grp_mst`에 코드그룹 등록
2. `cmm_cd_mst`에 코드 등록(`is_default_yn` 포함)
3. 도메인 테이블 DDL/FK 적용
4. 데이터 이관/백필 실행

## 3) 테이블별 매핑

### 3.1 `member` -> `mem_mst` + `team_mem_rel`
AS-IS의 전역 회원 정보를 v2 전역 회원/팀소속으로 분리한다.

#### A) `member` -> `mem_mst`
| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | `mem_id` | 1:1 유지 (`auth.users.id`) |
| `full_name` | `mem_nm` | 문자열 그대로 |
| `gender` | `gdr_enm` | 값셋 정규화 후 enum 매핑 |
| `birthday` | `birth_dt` | 날짜 그대로 |
| `phone` | `phone_no` | 포맷 정규화(공백/하이픈 정책) |
| `email` | `email_addr` | 소문자 정규화 권장 |
| `avatar_url` | `avatar_url` | 그대로 |
| `kakao_user_id` | `oauth_kakao_id` | 타입/포맷 점검 후 이관 |
| `google_user_id` | `oauth_google_id` | 타입/포맷 점검 후 이관 |
| `joined_at` | `crt_at`(기본) | 필요 시 `crt_at` 백필 기준으로 사용 |
| `created_at` | `crt_at` | `joined_at`보다 우선 기준으로 사용 가능(정책 합의 필요) |
| `updated_at` | `upd_at` | 그대로 이관 권장 |
| `status` | - | 전역 상태로 직접 이관하지 않음(팀 상태로 이관) |
| `admin` | - | 전역 admin 제거, 팀 역할로 이관 |
| `bank_name`, `bank_account` | - | v2 범위 미포함(보관/폐기 정책 별도 합의) |

보조 컬럼:
- `vers=0`, `del_yn=false`로 생성(정본 기준)
- `upd_at`은 `now()` 또는 AS-IS 기준시각 사용

#### B) `member` -> `team_mem_rel`
| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | `mem_id` | FK 연결 |
| (기본 팀) | `team_id` | 초기 운영팀(기강)으로 백필 |
| `status` | `mem_st_cd` | `active/inactive/pending` 매핑, 기타는 정책값으로 보정 |
| `admin` | `team_role_cd` | 공통코드값으로 매핑: `true -> TEAM_ROLE_CD.admin`, `false -> TEAM_ROLE_CD.member` (`owner`는 별도 지정) |
| `joined_at` | `join_dt` | 날짜 추출 |
| (없음) | `leave_dt` | 해당 시 null |

체크:
- 팀당 owner 최소 1명 정책을 별도 스크립트/수동 검증으로 보장

---

### 3.2 `competition` -> `comp_mst` + `comp_evt_cfg`
AS-IS 대회 1건 + `event_types[]`를 v2 대회/종목 분리 구조로 이관한다.

#### A) `competition` -> `comp_mst`
| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | `comp_id` | 1:1 유지 |
| `external_id` | `ext_id` | 그대로 |
| `sport` | `comp_sprt_cd` | 공통코드값으로 매핑 |
| `title` | `comp_nm` | 그대로 |
| `start_date` | `stt_dt` | 그대로 |
| `end_date` | `end_dt` | 그대로 |
| `location` | `loc_nm` | 그대로 |
| `source_url` | `src_url` | 그대로 |
| `raw` | - | v2 범위 미포함(원본 json 보존 필요 시 별도 아카이브 정책) |
| `created_at` | `crt_at` | 그대로 |
| `updated_at` | `upd_at` | 그대로 |

#### B) `competition.event_types[]` -> `comp_evt_cfg`
| AS-IS | v2 | 규칙 |
|---|---|---|
| `competition.id` | `comp_id` | FK |
| `event_types[i]` | `evt_cd` | 배열 원소별 1행 생성 |

---

### 3.3 `competition_registration` -> `team_comp_plan_rel` + `comp_reg_rel`
AS-IS 참가등록을 팀 운영 컨텍스트 + 참가 관계로 분리한다.

#### A) 준비: `team_comp_plan_rel` 생성
| 입력 | 출력 | 규칙 |
|---|---|---|
| (`competition_id`, 기본 `team_id`) | `team_comp_plan_rel` 1건 | 중복 없이 upsert 생성 |

#### B) `competition_registration` -> `comp_reg_rel`
| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | `comp_reg_id` | 1:1 유지(또는 신규 UUID + 원본ID 매핑테이블) |
| `member_id` | `mem_id` | FK |
| `role` | `prt_role_cd` | 공통코드 매핑 |
| `event_type` | `comp_evt_id` | `comp_evt_cfg(comp_id, evt_cd)` 조인으로 해석 |
| `competition_id` | `team_comp_id` | 사전 생성한 `team_comp_plan_rel` 조인 |
| `created_at` | `crt_at` | 그대로 |
| `updated_at` | `upd_at` | 그대로 |

---

### 3.4 `race_result` -> `rec_race_hist`
개인 기록 단일 원본으로 이관한다(참가 FK 강결합 없음).

| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | `race_result_id` | 1:1 유지 |
| `member_id` | `mem_id` | FK |
| `race_name` | `race_nm` | 그대로 |
| `race_date` | `race_dt` | 그대로 |
| `record_time_sec` | `rec_time_sec` | 그대로 |
| `swim_time_sec` | `swim_time_sec` | 그대로 |
| `bike_time_sec` | `bike_time_sec` | 그대로 |
| `run_time_sec` | `run_time_sec` | 그대로 |
| `event_type` | `comp_evt_id` | `evt_cd` 매칭으로 조인(불가 시 보정대상) |
| (대회명/날짜 기반) | `comp_id` | `comp_mst` 매칭(불가 시 보정대상) |
| `created_at` | `crt_at` | 그대로(없으면 `now()`) |
| (없음) | `rec_src_cd` | `manual` 등 기본값 정책 |

검증:
- `mem_id + comp_evt_id + race_dt + race_nm` 중복 여부 점검

---

### 3.5 `personal_best` (레거시)
`personal_best`는 v2에서 물리 테이블로 이관하지 않고, `rec_race_hist` 기반 파생(뷰/물리화)으로 대체한다.

| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | - | 별도 이관 없음(레거시 테이블 폐기 대상) |
| `member_id` | - | 별도 이관 없음(원본은 `race_result -> rec_race_hist`에서 확보) |
| `event_type` | - | 별도 이관 없음(파생 시 `comp_evt_id` 기준 계산) |
| `record_time_sec` | - | 별도 이관 없음 |
| `race_name` | - | 별도 이관 없음 |
| `race_date` | - | 별도 이관 없음 |
| `created_at` | - | 별도 이관 없음 |
| `updated_at` | - | 별도 이관 없음 |

대체 경로:
- 필요 시 `rec_pb_mat`를 `rec_race_hist` 집계 기반 뷰/물리화 뷰로 생성한다.

---

### 3.6 `utmb_profile`
`utmb_profile`은 현재 v2 범위에 미포함이며, 전 컬럼을 "미이관(보류)"으로 관리한다.

| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | - | v2 범위 미포함(보류) |
| `member_id` | - | v2 범위 미포함(보류) |
| `utmb_profile_url` | - | v2 범위 미포함(보류) |
| `utmb_index` | - | v2 범위 미포함(보류) |
| `created_at` | - | v2 범위 미포함(보류) |
| `updated_at` | - | v2 범위 미포함(보류) |

후속:
- 보존 필요가 확정되면 별도 도메인 문서에서 목적/권한/RLS를 정의 후 신규 테이블로 이관한다.

## 4) 회비 도메인 이관 원칙
AS-IS 스키마(`database-schema.md`)에는 회비 테이블이 없으므로 **신규 생성 + 초기 데이터 준비**로 간주한다.

대상 테이블:
- `fee_xlsx_upd_hist`
- `fee_txn_hist`
- `fee_policy_cfg`
- `fee_due_pay_hist`
- `fee_due_exm_cfg`
- `fee_due_exm_hist`
- `fee_mem_bal_snap`

초기값/전환:
- `fee_policy_cfg`: 기본 월회비 정책 1건 이상 시드
- 나머지 테이블: 빈 테이블 생성 후 운영 데이터 유입

## 5) 검증 체크포인트
- 계정 식별:
  - `member.id`와 `mem_mst.mem_id` 행 수/누락 검증
  - `email`, OAuth ID 중복/누락 검증
- 참가/기록:
  - `competition_registration` -> `comp_reg_rel` 누락 여부
  - `race_result` -> `rec_race_hist` 누락 및 `comp_id/comp_evt_id` 매핑 실패 건수
- 코드 매핑:
  - `*_cd` 컬럼이 코드그룹 정책과 일치하는지 검증
- 운영 샘플 점검:
  - 대표 회원 5~10명 표본으로 프로필/참가/기록 화면 결과 대조

## 6) 오픈 이슈
- `member.bank_name`, `member.bank_account` 처리 정책(보관/폐기/별도 이관) 확정 필요
- `event_type`/대회명 기반 `comp_id` 매칭 실패 건 처리 기준(수동 보정 플로우) 확정 필요
- owner 초기 지정 방식(수동/규칙) 확정 필요
