# 데이터베이스 스키마 가이드 v2 (설계 규약)

## 1) 설계 목표
- 멀티팀 확장 지원: 개인 데이터 전역 + 팀 컨텍스트 분리
- 운영 안전성: 점진 이관(v2 병행) + 롤백 가능 구조
- 유지보수성: 일관된 네이밍/공통 컬럼/권한 정책
- 테넌트 격리: 팀 간 데이터 완전 분리(교차 조회 금지)

## 2) 네이밍 규약 v1

### 2.1 테이블명
- 형식: `도메인_엔터티_접미사`
- 예시: `mem_mst`, `team_mem_rel`, `fee_due_pay_hist`
- 권장 접미사
  - `mst`: 기준 마스터 데이터
  - `rel`: 관계 테이블
  - `hist`: 이력/변경 추적
  - `log`: 이벤트 로그
  - `cfg`: 설정

### 2.2 컬럼명
- 형식: `의미_접미사`
- 공통 접미사
  - `_id`: 식별자
  - `_cd`: 코드값(코드)
  - `_nm`: 명칭
  - `_dt`: 날짜
  - `_at`: 일시(timestamp)
  - `_yn`: 불리언(Y/N 성격)
  - `_amt`: 금액
  - `_cnt`: 개수
- FK 컬럼은 참조 엔터티명 기반으로 통일
  - 예: `mem_id`, `team_id`, `comp_id`, `comp_evt_id`
- 축약 표기 규칙
  - `start`는 `stt`로 축약한다.
  - 예: `stt_dt`, `event_stt_at`
  - `apply`는 `aply`로 축약한다.
  - 예: `aply_stt_dt`, `aply_end_dt`
- 코드 컬럼 구분 규칙
  - `*_enm`: DB enum 컬럼
  - `*_cd`: 공통코드(`cmm_cd_mst`) 참조 컬럼
  - 예: `gdr_enm`(enum), `mem_st_cd`(공통코드)
  - 예외: 외부/업무 식별 코드는 `*_cd`를 쓸 수 있음 (예: `team_cd`)
    - 이 경우 공통코드가 아니며, 유니크 식별값으로 취급한다.

### 2.3 제약/인덱스 명
- PK: `pk_<table>`
- UK: `uk_<table>_<columns>`
- FK: `fk_<from_table>__<to_table>`
- INDEX: `ix_<table>_<columns>`
- 정책(RLS): `<table>_<action>_<scope>`

## 3) 공통 메타 컬럼 규약

### 3.1 기본 공통 컬럼
모든 업무 테이블에서 기본 적용(예외 허용: 순수 조인 테이블)

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `crt_at` | `timestamptz` | `now()` | 생성시각 |
| `upd_at` | `timestamptz` | `now()` | 수정시각 |
| `del_yn` | `boolean` | `false` | 소프트 삭제 여부 |
| `vers` | `integer` | `1` | 낙관적 락/변경 버전 |

### 3.2 선택 공통 컬럼
- `crt_by` (`uuid`): 생성 주체 사용자 ID
- `upd_by` (`uuid`): 수정 주체 사용자 ID
- `del_at` (`timestamptz`): 소프트 삭제 시각
- `del_by` (`uuid`): 삭제 주체 사용자 ID

## 4) `vers` 운용 규칙
- 대상: 변경 이력이 의미 있는 테이블(회원, 팀소속, 회비정책·납부·면제·스냅샷, 대회·참가 등; 도메인별로 `vers` 적용 여부는 정의서 기준)
- 의미 정의
  - `vers = 0`: 현재 활성(정본) 행
  - `vers > 0`: 과거 이력 행
- 규칙
  - 신규 정본 INSERT는 `vers = 0`으로 생성한다.
  - 변경 시 기존 정본을 이력(`vers > 0`)으로 보존하고, 새 정본(`vers = 0`) 행을 유지한다.
  - `vers`는 "행 버전(이력)" 용도이며, 같은 비즈니스 식별자의 정본/이력을 구분하는 축이다.
- 목적
  - 활성 데이터와 이력 데이터의 명확한 분리
  - 감사/추적 가능한 변경 이력 보존
- 유니크 제약 기본 원칙
  - 비즈니스 식별자 유니크와 `vers` 규칙은 분리한다.
    - 활성 정본은 비즈니스 식별자 유니크를 강제한다(예: `email_addr`, `team_id + mem_id` 등).
    - 이력 행은 정본 유니크를 침범하지 않도록 별도 제약(예: `id + vers`)으로 관리한다.
  - 비필수 컬럼 변경 시에도 "정본 1건 + 이력 누적"만 발생하며, 비즈니스 식별자 중복은 허용하지 않는다.
  - `where del_yn = false` 기반 부분 유니크는 사용하지 않는다.

## 5) 소프트 삭제 규칙
- 기본 정책: soft-delete(`del_yn`)를 유지한다.
- 물리 삭제는 "예외 승인"된 테이블에만 허용한다.
- 핵심 관계 테이블(`team_mem_rel`)은 물리 삭제를 금지한다.
- 조회 기본 규칙
  - 모든 비즈니스 쿼리에서 `del_yn = false` 조건 강제
  - 필요 시 `active_*` 뷰 제공

### 5.2 하드삭제 예외 승인 규칙
- 하드삭제 허용은 테이블 단위로만 결정한다.
- 승인 기준
  - 법적/감사 보관 의무가 없음
  - 삭제 시 복구 불필요
  - 운영상 데이터 정합성 영향이 작음
- 현재 상태: 하드삭제 허용 테이블은 미확정(`TBD`)

### 5.1 `status`와 `del_yn`의 역할 분리
- `*_st_cd`(예: `mem_st_cd = inactive`)는 "업무 상태"를 표현한다.
- `del_yn = true`는 "서비스 조회 대상에서 제외된 논리 삭제"를 의미한다.
- 따라서 `inactive`와 `del_yn = true`는 대체 관계가 아니다.
  - `inactive + del_yn = false`: 계정은 보존, 활동만 중지
  - `del_yn = true`: 일반 기능에서 숨김(복구 가능)
- 상태코드 권장값은 도메인 문서 기준으로 고정한다.
  - 예: `active`, `inactive`, `pending`, `left`, `banned`

## 6) 멀티팀 데이터 소유 모델

- 전역(플랫폼 공통): `mem_mst` (로그인/기본 계정 식별)
- 팀 스코프(테넌트 격리 대상): 기록/대회운영/참가/회비/칭호 등 팀 소속 업무 데이터 전부(팀 이벤트는 도메인 문서에서 단계적으로 확장)
- 원칙: 비즈니스 데이터는 `team_id`를 반드시 포함해 팀 경계 내에서만 조회/수정

### 6.1 팀별로 다른 정보가 필요할 때의 처리 원칙
- 원칙적으로 전역 원본을 유지한다.
- 향후 팀별 차등 정보 요구가 생기면, 전역 테이블을 깨지 않고 팀별 오버라이드 테이블을 별도 추가한다.
- 상세 스키마는 요구사항 확정 시점에 별도 설계한다.

## 7) RLS 기준 원칙
- 사용자 접근은 반드시 팀 소속(`team_mem_rel`)을 기준으로 검증
- 전역 계정 데이터는 본인만 조회/수정 가능
- 팀 데이터는 같은 `team_id` 소속 멤버만 접근 가능
- 팀 데이터의 CUD는 팀 역할(`team_role_cd`)로 제어
- 최종 관리자(플랫폼 운영자)는 서비스 롤 또는 별도 관리자 정책으로만 유지보수 접근 허용

## 8) 문서화/DDL 작성 규칙
- 모든 신규 테이블은 목적/소유/삭제정책/버전정책을 정의서에 먼저 기록
- 설계 단계에서는 문서를 먼저 확정하고, SQL은 마지막에 일괄 작성/갱신한다.
- 마이그레이션 SQL에는 다음 섹션을 포함
  1) 생성
  2) 백필
  3) 인덱스/제약
  4) RLS
  5) 롤백

## 9) 설정 테이블 운용 기준 (일관성)
- 원칙: "도메인 데이터"와 "운영 정책값"을 분리한다.
- 도메인 데이터는 각 도메인 테이블에서 관리한다.
- 정책값(토글/한도/주기)은 팀 정책 테이블에서 관리한다.

### 9.1 정책 테이블에 넣을 항목 (예시)
- 대표 칭호 최대 개수
- 회비 자동 청구 사용 여부
- 회비 청구 기준일(매월 N일)
- 지각/결석 자동 제재 사용 여부
- 이벤트 참석 체크 마감 시간
- 팀 공개 범위(비공개/초대/공개)

### 9.2 도메인 테이블에 남길 항목 (예시)
- 실제 회비 납부 원장 (`fee_due_pay_hist`), 원시 거래 (`fee_txn_hist`), 면제 규칙/이력 (`fee_due_exm_cfg`, `fee_due_exm_hist`), 누적 스냅샷 (`fee_mem_bal_snap`)
- 팀·대회 참가 맥락 (`team_comp_plan_rel` — **참가가 생긴 대회만** 행 존재; 팀이 참가한 대회 수는 이 테이블의 해당 `team_id` 행 수로 보면 됨. 상세는 `database-schema-v2-domains.md` §2)
- 실제 대회 참가 내역 (`comp_reg_rel`)
- 실제 기록 데이터 (`rec_race_hist`, `comp_id`/`comp_evt_id` 정합성 검증)
- 칭호·팀 이벤트 등은 도메인 설계가 확정되면 동일 원칙으로 추가한다(현재 `database-schema-v2-domains.md`는 해당 섹션 작성 보류).

### 9.3 의사결정 규칙
- 이력/트랜잭션이 핵심이면 도메인 테이블
- 값 하나를 바꿔 동작 규칙을 바꾸는 성격이면 정책 테이블

## 10) 공통코드 라이트 도입안 (v1.5)
- 목적: enum만으로 부족한 운영 코드(상태/역할/결제수단)를 DB에서 일관 관리
- 범위: 최소 2개 테이블만 먼저 도입
  - `cmm_cd_grp_mst` (코드그룹)
  - `cmm_cd_mst` (코드)

### 10.1 기본 구조
- `cmm_cd_grp_mst`: `cd_grp_id`, `cd_grp_cd`, `cd_grp_nm`, `use_yn`, `sort_ord`, `vers`, `del_yn`, `crt_at`, `upd_at`
- `cmm_cd_mst`: `cd_id`, `cd_grp_id`, `cd`, `cd_nm`, `cd_desc`, `use_yn`, `sort_ord`, `is_default_yn`, `vers`, `del_yn`, `crt_at`, `upd_at`

### 10.2 현재 우선 적용 대상 (`*_cd` → 공통코드 `cmm_cd_mst`)
아래 컬럼은 **PostgreSQL enum이 아닌** 공통코드로 관리한다(코드그룹은 `cmm_cd_grp_mst`).

**회원·팀**
- `team_mem_rel.mem_st_cd` (팀 소속 회원 상태)
- `team_mem_rel.team_role_cd` (팀 내 역할)

**대회·참가**
- `comp_mst.comp_sprt_cd` (대회 스포츠/형태 분류)
- `comp_evt_cfg.comp_evt_type` (대회 내 코스·종목 타입 자유 문자열. 예: `12K`, `OLYMPIC`, `FULL`)
- `comp_reg_rel.prt_role_cd` (참가 역할: 참가자/응원/봉사 등)

**기록**
- `rec_race_hist.rec_src_cd` (기록 출처: manual/imported/api 등, 운영에서 코드값 확정)

**회비**
- `fee_xlsx_upd_hist.upd_st_cd` (업로드 처리 상태: pending/confirmed/rolled_back 등)
- `fee_txn_hist.match_st_cd` (자동매칭 상태: matched/unmatched/ambiguous)
- `fee_txn_hist.fee_item_cd` (거래 분류: due/expense/event_fee/goods/other 등)
- `fee_due_pay_hist.pay_st_cd` (납부 원장 상태: paid/cancelled/refunded 등)

> 위 코드그룹 ID·초기 코드값 목록은 DDL/시드 단계에서 `cmm_cd_grp_mst`/`cmm_cd_mst`로 반영한다.

### 10.3 enum 유지 대상 (`*_enm`)
아래는 코드셋이 작고 스키마 안정성이 높아 **DB enum**으로 두는 것을 권장한다.

- `mem_mst.gdr_enm` (성별)
- `fee_txn_hist.txn_io_enm` (입금/출금: `deposit`, `withdrawal`)
- `fee_due_exm_cfg.exm_tp_enm` (면제 유형: `full`, `part`)
- `fee_due_exm_hist.grant_src_enm` (면제 발생 출처: `manual`, `rule_attd` 등; 값 확정은 구현 시 enum에 고정)

> enum을 늘리기 전에는 “운영에서 자주 바뀌는 코드”는 10.2 공통코드로 보내고, “거의 안 바뀌는 고정 집합”만 enum으로 둔다.
