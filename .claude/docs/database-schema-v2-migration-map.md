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
| `comp_evt_cfg.comp_evt_cd` | `COMP_EVT_CD` | `5K`, `10K`, `HALF`, `FULL`, `50K`, `100K`, `100M` (`cmm_cd_mst.cd` 문자열과 동일) |
| `comp_reg_rel.prt_role_cd` | `PRT_ROLE_CD` | `participant`, `cheering`, `volunteer` |
| `rec_race_hist.rec_src_cd` | `REC_SRC_CD` | `manual`, `imported`, `api` |
| `fee_xlsx_upd_hist.upd_st_cd` | `FEE_UPD_ST_CD` | `pending`, `confirmed`, `rolled_back` |
| `fee_txn_hist.match_st_cd` | `FEE_TXN_MATCH_ST_CD` | `matched`, `unmatched`, `ambiguous` |
| `fee_txn_hist.fee_item_cd` | `FEE_ITEM_CD` | `due`, `expense`, `event_fee`, `goods`, `other` |
| `fee_due_pay_hist.pay_st_cd` | `FEE_PAY_ST_CD` | `paid`, `cancelled`, `refunded` |

**명명 관례(고정):** `cd_grp_cd` 문자열과 컬럼명을 글자 단위로 맞출 필요는 없다. 다만 **위 표가 `cd_grp_cd` ↔ 컬럼 ↔ 허용 값의 단일 기준**이다. 회비 등은 테이블명이 맥락을 주므로 `upd_st_cd`·`match_st_cd`·`pay_st_cd`처럼 **테이블 맥락 수준의 축약**은 허용한다. 신규 `*_cd` 컬럼을 추가할 때는 반드시 표를 갱신하고, **`cmm_cd_mst.cd` 저장 값과 CHECK·백필 매핑을 한 번에 맞출 것**(prd에서 소문자/대문자·컬럼명 불일치를 현장에서 맞추려 하지 말 것).

시드 순서:
1. `cmm_cd_grp_mst`에 코드그룹 등록
2. `cmm_cd_mst`에 코드 등록(`is_default_yn` 포함)
3. 도메인 테이블 DDL/FK 적용
4. 데이터 이관/백필 실행

## 3) 테이블별 매핑

### 3.0 레거시 `public` 컬럼 점검 (백필 SQL ↔ 실제 스키마)

기준 스냅샷: `supabase/migrations/20260325091708_remote_schema.sql`. **prd/dev에서 컬럼이 다르면** 백필 전 `information_schema.columns`로 재확인할 것.

| 테이블 | DDL에 있는 컬럼(요약) | 백필에서 참조하는 컬럼 | `updated_at` |
|--------|-------------------------|-------------------------|--------------|
| `member` | `id`, `full_name`, `gender`, `birthday`, `phone`, `status`, `admin`, `joined_at`, `created_at`, `updated_at`, `email`, `bank_account`, `bank_name`, `kakao_user_id`, `google_user_id`, `avatar_url` | 위 전부 중 백필용: `id`, `full_name`, `gender`, `birthday`, `phone`, `email`, `bank_name`, `bank_account`, `avatar_url`, `kakao_user_id`, `google_user_id`, `created_at`, `updated_at`, `admin`, `status`, `joined_at` | **있음** — `upd_at`은 `coalesce(updated_at, created_at)` |
| `competition` | `id`, `sport`, `title`, `start_date`, `end_date`, `location`, `event_types`, `source_url`, `raw`, `created_at`, `updated_at`, `external_id` | `id`, `sport`, `title`, `start_date`, `end_date`, `location`, `source_url`, `external_id`, `created_at`, `updated_at`, `event_types` | **있음** — 동일 `coalesce` |
| `competition_registration` | `id`, `competition_id`, `member_id`, `role`, `event_type`, `created_at`, `updated_at` | 전부 | **있음** — 동일 `coalesce` |
| `race_result` | `id`, `member_id`, `event_type`, `record_time_sec`, `race_name`, `race_date`, `created_at`, `swim_time_sec`, `bike_time_sec`, `run_time_sec` | 위 중 백필용 전부 | **없음** — `rec_race_hist.crt_at`·`upd_at` 모두 `created_at`만 사용 |

- `personal_best`는 본 백필 마이그레이션에서 **읽지 않음** (§3.5). `utmb_profile` → `mem_utmb_prf` 는 **`20260404165809_v2_mem_utmb_prf.sql`** (§3.6).
- 나중에 `race_result`에 `updated_at`을 추가한 DB에서는 백필 SQL을 `coalesce(rr.updated_at, rr.created_at)`로 바꿀 수 있음(컬럼이 존재할 때만 유효).

### 3.1 `member` -> `mem_mst` + `team_mem_rel`
AS-IS의 전역 회원 정보를 v2 전역 회원/팀소속으로 분리한다.

#### 회원·가입 시각 구분(필수)
- **`mem_mst.crt_at`**: 회원 마스터 **행이 처음 생긴 시각**(데이터/레코드 생성 시각, 감사 추적용). **가입일과 무관**하다. 마이그레이션 백필 시 **`member.created_at` → `crt_at`만** 사용한다. `joined_at`을 `crt_at`에 넣거나 대체 기준으로 쓰지 않는다.
- **팀(크루) 가입일**: **`team_mem_rel.join_dt`에만** 둔다. 출처는 **`member.joined_at` → `join_dt`** 뿐이다. 회비·운영 기준일 등 “언제 크루에 들어왔는가”는 이 필드로 판단한다.

#### 연락처·이메일 정규화(필수)
마이그레이션·이후 입력 경로 모두 동일 규칙을 적용해 **유니크·검색·매칭**이 흔들리지 않게 한다.

**전화번호 `phone_no`**
1. 앞뒤 공백 제거(일반 공백·탭; 전각 공백은 ASCII 공백으로 치환 후 trim).
2. 제거 문자: 공백, 하이픈(`-`), 괄호 `(` `)`, 점(`.`). 국제 형식 구분용 `+`만 예외로 허용(3번에서 처리).
3. **국내(한국) 번호 캐논 형식**: 숫자만 남긴 뒤, `82`로 시작하고 그 다음이 `0`이 아니면 선두 `82`를 `0`으로 치환(예: `+82 10-1234-5678` → `01012345678`). 그 외는 선행 `0`을 유지해 **휴대폰 11자리(`01xxxxxxxxx`) 또는 유선/기타는 자리수 규칙에 맞는 숫자열**로 통일. 한국 번호가 아닌 값은 **E.164 등 별도 합의** 없이 위 규칙만 적용하면 왜곡될 수 있으므로, 이관 시 별도 플래그·수동 리스트로 분리한다.
4. 정리 후 숫자가 비었거나 길이·패턴이 명백히 잘못된 값은 `null`로 두고 **별도 검증 리스트**로 수동 확인(잘못된 값을 억지로 채우지 않음).
5. v2 `mem_mst`의 유니크·중복 제거·회비 매칭 등은 **항상 위 캐논 문자열**을 기준으로 한다.

**이메일 `email_addr`**
1. 앞뒤 공백 제거(전각 공백은 ASCII 공백 치환 후 trim).
2. **전체 문자열을 소문자로 변환**(로컬파트·도메인 모두). PostgreSQL `lower()`와 동일한 의미의 로케일 고정 규칙으로 처리(마이그레이션 스크립트·앱 입력 동일).
3. 빈 문자열은 `null`. `@` 없음 등 형식 오류는 `null` 또는 수동 리스트로 분리(정책 합의).
4. `mem_mst` 활성 정본의 `email_addr` 유니크는 **정규화된 값** 기준이어야 하며, OAuth·로그인 식별자와 별개로 **동일 인물 중복 행**이 생기지 않도록 이관 전 `lower(trim)` 기준 중복 점검을 필수로 한다.

#### A) `member` -> `mem_mst`
| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | `mem_id` | 1:1 유지 (`auth.users.id`) |
| `full_name` | `mem_nm` | 문자열 그대로 |
| `gender` | `gdr_enm` | 값셋 정규화 후 enum 매핑 |
| `birthday` | `birth_dt` | 날짜 그대로 |
| `phone` | `phone_no` | 위 **전화번호 정규화(필수)** 적용 |
| `email` | `email_addr` | 위 **이메일 정규화(필수)** 적용 |
| `avatar_url` | `avatar_url` | 그대로 |
| `kakao_user_id` | `oauth_kakao_id` | 타입/포맷 점검 후 이관 |
| `google_user_id` | `oauth_google_id` | 타입/포맷 점검 후 이관 |
| `joined_at` | - | `mem_mst`에 넣지 않음. **크루 가입일**은 `team_mem_rel.join_dt`로만 이관(위 **회원·가입 시각 구분**). `crt_at` 백필에 사용 금지 |
| `created_at` | `crt_at` | **`crt_at`의 유일한 출처**. AS-IS `created_at` 그대로 이관(우선순위·대체 필드 없음) |
| `updated_at` | `upd_at` | 그대로 이관 |
| `status` | - | 전역 상태로 직접 이관하지 않음(팀 상태로 이관) |
| `admin` | - | 전역 admin 제거, 팀 역할로 이관 |
| `bank_name` | `bank_nm` | 환불 계좌 관리 목적. trim 후 이관(빈 문자열은 `null`) |
| `bank_account` | `bank_acct_no` | 환불 계좌 관리 목적. 공백/하이픈 제거 후 이관(빈 문자열은 `null`) |

보조 컬럼:
- `vers=0`, `del_yn=false`로 생성(정본 기준)
- `crt_at`은 표의 `created_at` 매핑만 따른다(임의 `now()` 백필로 `created_at`을 대체하지 않음)
- `upd_at`은 `now()` 또는 AS-IS `updated_at` 사용

#### B) `member` -> `team_mem_rel`

##### `member.status` → `mem_st_cd` 매핑(필수)
AS-IS 문서상 값은 `active` / `inactive` / `pending`이다. v2 `MEM_ST_CD` 시드에는 `left`, `banned`가 추가로 있으므로, **이관 시에는 아래 표에 있는 쌍만 허용**한다.

| AS-IS `member.status`(trim·소문자 정규화 후 비교) | `mem_st_cd` | 비고 |
|---|---|---|
| `active` | `active` | 동명 |
| `inactive` | `inactive` | 동명. AS-IS에 탈퇴 전용 값이 없으므로 이관 시점에는 `inactive` 유지(휴면·탈퇴 혼재 가능). **일괄로 `left`로 승격하지 않는다**(왜곡 방지). 실제 탈퇴 반영은 이관 후 운영 규칙으로 `left` + `leave_dt` 설정 |
| `pending` | `pending` | 동명 |
| `banned` | `banned` | 동명. 스키마 문서에 없어도 DB에 존재하면 그대로 이관 |
| `left` | `left` | AS-IS 표준 값셋에는 없음. **레거시/드리프트**로 컬럼에 있으면 동명 이관 |
| `null` 또는 빈 문자열 | `pending` | 온보딩·미검증으로 간주. 예외적으로 팀에서 확정한 행만 수동 SQL로 다른 코드 부여 가능 |
| 위에 없는 문자열 | **이관 중단·수동 리스트** | 임의 기본값 부여 금지. 시드에 코드 추가 또는 AS-IS 데이터 정제 후 매핑표를 갱신해 재실행 |

검증: 이관 후 `mem_st_cd` distinct 집합이 시드에 없는 값을 포함하면 실패로 본다.

| AS-IS | v2 | 규칙 |
|---|---|---|
| `id` | `mem_id` | FK 연결 |
| (기본 팀) | `team_id` | 초기 운영팀(기강)으로 백필 |
| `status` | `mem_st_cd` | 위 **`member.status` → `mem_st_cd` 매핑(필수)** 만 적용(임의 보정 금지) |
| `admin` | `team_role_cd` | AS-IS boolean → `TEAM_ROLE_CD` 코드값: `true`→`admin`, `false`→`member` (`owner`는 별도 지정·시드) |
| `joined_at` | `join_dt` | **크루 가입 시각**; `mem_mst.crt_at`과 혼동 금지(위 **회원·가입 시각 구분**) |
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
| `event_types[i]` | `comp_evt_cd` | 배열 원소별 1행 생성 (마이그레이션 `20260404102205`에서 컬럼명·값 규약 통일) |

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
| `id` | `comp_reg_id` | **1:1 유지(확정)**. 신규 UUID 재발급/매핑테이블 전략은 사용하지 않음 |
| `member_id` | `mem_id` | FK |
| `role` | `prt_role_cd` | 공통코드 매핑 |
| `event_type` | `comp_evt_id` | `comp_evt_cfg(comp_id, comp_evt_cd)` 조인으로 해석 |
| `competition_id` | `team_comp_id` | 사전 생성한 `team_comp_plan_rel` 조인 |
| `created_at` | `crt_at` | 그대로 |
| `updated_at` | `upd_at` | 그대로 |

정책 고정:
- `comp_reg_rel.comp_reg_id`는 AS-IS `competition_registration.id`를 그대로 사용한다.
- 참조 정합성(기록 대조/추적)과 롤백 단순화를 위해 ID 재발급은 허용하지 않는다.

---

### 3.4 `race_result` -> `rec_race_hist`
개인 기록 단일 원본으로 이관한다(참가 FK 강결합 없음).

#### 레거시 입력 방식과 B-3(null) 다발 원인
- **초기:** 기록은 `race_name`·`race_date`를 **자유 입력**으로 받았다.
- **현재(앱):** 대회는 **`comp_mst` 선택** 후 입력하는 흐름으로 바뀌었다.
- **백필 매칭:** `rec_race_hist.comp_id`는 `lower(trim(race_nm))` = `lower(trim(comp_mst.comp_nm))` 이고 `race_dt`가 대회 기간 안일 때만 자동 부여된다. 자유 입력·오타·연도 표기·날짜 오기입이 있으면 **매칭 실패 → `comp_id`/`comp_evt_id` null**이 다수 발생하는 것이 정상이다.
- **prd:** 과거 동일 데이터를 이관하면 **dev와 같은 패턴**으로 null·불일치가 생긴다(자동 이관만으로는 한계).

#### 데이터 정합 후 운영 방향(팀 합의안 — 물리 스키마)
목표는 **정본을 FK(`comp_id`, `comp_evt_id`)에 두고**, 자유입력 시절 문자열을 장기적으로 **중복 저장하지 않는 것**이다(`mem_mst`만 두고 하위 테이블에 `mem_nm`을 복제하지 않는 논리와 동일).

1. 데이터 적재·백필 후, 필요 시 **`race_nm`을 `comp_mst.comp_nm`과 일치하도록** 수동·배치로 정리하고, **`race_dt`** 오기입도 함께 검토한다.
2. 그다음 **`comp_id`**를 행별로 맞춘다(재매칭 쿼리 또는 운영 스크립트).
3. 이어서 **`comp_evt_id`**를 맞춘다(종목 매핑·`comp_evt_cfg` 조인).
4. 정합이 안정되면 **`race_nm` 컬럼 제거**를 검토한다(별도 DDL 마이그레이션). 화면·리포트의 “대회명”은 **`comp_mst` 조인** 또는 **VIEW**로 표현한다.

**prd 게이트:** 수동 정합·검증 완료 후 **`rec_race_hist.comp_id`는 null 없음**을 목표로 하고, 필요 시 **`SET NOT NULL`** 마이그레이션으로 고정한다(FK는 기존 DDL에 있으나 nullable).

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
| `event_type` | `comp_evt_id` | `comp_evt_cd` 매칭으로 조인(불가 시 보정대상) |
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

### 3.6 `utmb_profile` → `mem_utmb_prf`
회원당 0~1행(`member_id` 유니크). v2 는 `mem_mst` 1:1 확장 테이블 `mem_utmb_prf` 로 이관한다.

| AS-IS | v2 (`mem_utmb_prf`) | 규칙 |
|---|---|---|
| `id` | `utmb_prf_id` | **1:1 유지**(백필 시 동일 UUID) |
| `member_id` | `mem_id` | `mem_mst` 정본(`vers=0`, `del_yn=false`)에 존재하는 행만 삽입 |
| `utmb_profile_url` | `utmb_prf_url` | 그대로 |
| `utmb_index` | `utmb_idx` | `CHECK (utmb_idx >= 0)` |
| `created_at` | `crt_at` | 그대로 |
| `updated_at` | `upd_at` | 그대로 |
| (없음) | `vers` | `0` |
| (없음) | `del_yn` | `false` |

마이그레이션: `supabase/migrations/20260404165809_v2_mem_utmb_prf.sql` (DDL·RLS·백필 동일 파일). 선행: P1 `mem_mst`.

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
  - 3.1절 연락처·이메일 정규화 적용 후 `email_addr`·`phone_no` 중복·충돌 검증, OAuth ID 중복/누락 검증
- 참가/기록:
  - `competition_registration` -> `comp_reg_rel` 누락 여부
  - `race_result` -> `rec_race_hist` 누락 및 `comp_id/comp_evt_id` 매핑 실패 건수
- 코드 매핑:
  - `*_cd` 컬럼이 코드그룹 정책과 일치하는지 검증
- 운영 샘플 점검:
  - 대표 회원 5~10명 표본으로 프로필/참가/기록 화면 결과 대조

### 5.1 실행 표준(고정)
- 아래 SQL을 **그대로 실행**한다(담당자별 임의 쿼리 금지).
- 각 쿼리는 `count(*)` 또는 키 목록을 반환해야 하며, **0건이 목표**인 항목은 0이 아니면 실패로 본다.
- 대량 데이터에서는 전체 스캔 쿼리(anti join, distinct)는 저부하 시간대에 실행한다.
- 운영 샘플은 `order by random()` 대신 해시 기반 샘플링을 사용한다(성능/재현성 목적).

### 5.2 SQL 검증 템플릿

#### A) 계정 식별/정합성
```sql
-- A-1. 행 수 비교
select
  (select count(*) from member)  as asis_member_cnt,
  (select count(*) from mem_mst where vers = 0 and del_yn = false) as v2_mem_cnt;
```

```sql
-- A-2. AS-IS에는 있는데 v2에 없는 mem_id (누락)
select m.id as missing_mem_id
from member m
left join mem_mst mm
  on mm.mem_id = m.id
 and mm.vers = 0
 and mm.del_yn = false
where mm.mem_id is null;
```

```sql
-- A-3. 정규화 이메일 중복 (활성 정본 기준)
select lower(trim(email_addr)) as norm_email, count(*) as dup_cnt
from mem_mst
where vers = 0
  and del_yn = false
  and email_addr is not null
group by lower(trim(email_addr))
having count(*) > 1;
```

```sql
-- A-4. 정규화 전화번호 중복 (활성 정본 기준)
select phone_no, count(*) as dup_cnt
from mem_mst
where vers = 0
  and del_yn = false
  and phone_no is not null
group by phone_no
having count(*) > 1;
```

#### B) 참가/기록 이관 누락
```sql
-- B-1. competition_registration -> comp_reg_rel 누락
select cr.id as missing_comp_reg_id
from competition_registration cr
left join comp_reg_rel crr
  on crr.comp_reg_id = cr.id
where crr.comp_reg_id is null;
```

```sql
-- B-2. race_result -> rec_race_hist 누락
select rr.id as missing_race_result_id
from race_result rr
left join rec_race_hist rh
  on rh.race_result_id = rr.id
where rh.race_result_id is null;
```

**B-2 누락 원인(레거시 중복 등록):** 과거 UI·검증 한계로 **동일 회원·동일 대회일·동일 대회명·동일 종목(`comp_evt_id` 매핑 결과)** 의 `race_result` 가 **두 건 이상** 쌓인 경우, v2 `uk_rec_race_hist_mem_evt_dt_nm_vers` 와 맞물려 백필 `ON CONFLICT DO NOTHING` 에서 **한 건만 삽입**되고 나머지는 B-2 누락이 된다. **운영계(prd)에서도 동일**할 수 있으므로, P7 백필 전에 아래 스크립트로 충돌 후보를 **리스트업**한 뒤 유지할 `race_result_id` 를 골라 중복을 정리하는 것을 권장한다.

- 진단 SQL(백필과 동일 조인·종목 매핑): `scripts/sql/v2_p7_race_result_uk_duplicate_list.sql`  
  (`comp_evt_id` 가 NULL 로 매핑되는 행은 PostgreSQL UNIQUE 규칙상 UK 충돌 대상에서 제외될 수 있음 — 파일 주석 참고.)

```sql
-- B-3. rec_race_hist 매핑 실패 집계
select
  count(*) filter (where comp_id is null) as comp_id_null_cnt,
  count(*) filter (where comp_evt_id is null) as comp_evt_id_null_cnt
from rec_race_hist;
```

```sql
-- B-4. utmb_profile -> mem_utmb_prf 누락 (mem_mst 정본에 맞는 소스만 대상)
select u.id as missing_utmb_prf_id
from utmb_profile u
inner join mem_mst mm
  on mm.mem_id = u.member_id and mm.vers = 0 and mm.del_yn = false
left join mem_utmb_prf p on p.utmb_prf_id = u.id
where p.utmb_prf_id is null;
```

#### C) 코드 매핑 검증
```sql
-- C-1. team_mem_rel.mem_st_cd가 코드그룹 정책 외 값을 가지는지 확인
select t.mem_st_cd, count(*) as cnt
from team_mem_rel t
left join cmm_cd_mst c
  on c.cd = t.mem_st_cd
 and c.vers = 0
 and c.del_yn = false
left join cmm_cd_grp_mst g
  on g.cd_grp_id = c.cd_grp_id
 and g.cd_grp_cd = 'MEM_ST_CD'
 and g.vers = 0
 and g.del_yn = false
where t.mem_st_cd is not null
  and g.cd_grp_id is null
group by t.mem_st_cd;
```

```sql
-- C-2. team_role_cd 정책 외 값 확인
select t.team_role_cd, count(*) as cnt
from team_mem_rel t
left join cmm_cd_mst c
  on c.cd = t.team_role_cd
 and c.vers = 0
 and c.del_yn = false
left join cmm_cd_grp_mst g
  on g.cd_grp_id = c.cd_grp_id
 and g.cd_grp_cd = 'TEAM_ROLE_CD'
 and g.vers = 0
 and g.del_yn = false
where t.team_role_cd is not null
  and g.cd_grp_id is null
group by t.team_role_cd;
```

#### D) 운영 샘플(재현 가능한 10명)
```sql
-- D-1. 고정 샘플(해시 기반): 실행자마다 동일한 10명
select mem_id
from mem_mst
where vers = 0
  and del_yn = false
order by md5(mem_id::text)
limit 10;
```

```sql
-- D-2. 샘플 회원의 참가/기록 대조용 집계
with sample as (
  select mem_id
  from mem_mst
  where vers = 0
    and del_yn = false
  order by md5(mem_id::text)
  limit 10
)
select
  s.mem_id,
  count(distinct crr.comp_reg_id) as reg_cnt,
  count(distinct rh.race_result_id) as race_cnt
from sample s
left join comp_reg_rel crr on crr.mem_id = s.mem_id
left join rec_race_hist rh on rh.mem_id = s.mem_id
group by s.mem_id
order by s.mem_id;
```

### 5.3 합격 기준
- A-2, A-3, A-4, B-1, B-2, B-4, C-1, C-2 결과는 모두 **0건**이어야 한다. (B-3·`rec_race_hist` null 집계는 별도 합의)
- B-3의 `*_null_cnt`는 허용 기준(수동 보정 대상)과 함께 별도 리포트로 남긴다.
- D-2 결과는 프로필/참가/기록 화면 표본 검수 결과와 함께 체크리스트에 첨부한다.

## 6) 오픈 이슈
- (Blocker) `event_type`/대회명 기반 `comp_id` 매칭 실패 건 처리 기준(수동 보정 플로우) 확정 필요
- (Non-blocker) owner 초기 지정 방식(수동/규칙) 확정 필요
- (확정됨) 환불 운영 목적의 회원 계좌정보(`bank_nm`, `bank_acct_no`)는 `mem_mst`로 이관
