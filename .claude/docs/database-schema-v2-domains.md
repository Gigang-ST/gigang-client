# 도메인 확장 설계 v2 (대회·참가·기록·회비)

멀티팀 v2에서 **대회/참가/기록/회비** 도메인을 정의한다. 팀 이벤트·칭호는 본 문서 하단에 **작성 보류**로 두었으며, 별도 요구 확정 후 동일 규약으로 추가한다.

## 1) 설계 원칙
- 개인 원본 데이터는 `mem_id` 기준으로 전역 관리
- 팀 운영 데이터는 `team_id` 기준으로 스코프 분리
- 전역 마스터와 팀 컨텍스트를 분리해 중복 저장을 방지
- 팀 간 데이터 공유 금지(독립 테넌트) 원칙을 유지

## 2) 대회/참가 도메인

### `comp_mst` (전역 대회 마스터)
외부/내부 대회 원본 정의를 저장한다.

필수 컬럼:
- `comp_id` (PK)
- `comp_sprt_cd`, `comp_nm`, `stt_dt`, `end_dt`, `loc_nm`
- `src_url`, `ext_id`
- `vers`, `del_yn`, `crt_at`, `upd_at`

### `comp_evt_cfg` (대회 종목 설정)
한 대회에 여러 종목(10K/FULL 등)을 별도 테이블로 분리 저장한다.

필수 컬럼:
- `comp_evt_id` (PK)
- `comp_id` (FK -> `comp_mst`)
- `comp_evt_type` (대회 이벤트 타입 자유 문자열. 예: `12K`, `OLYMPIC`, `FULL`)
- `vers`, `del_yn`, `crt_at`, `upd_at`

유니크:
- (`comp_id`, `comp_evt_type`, `vers`)

분리 이유(과설계 방지 관점):
- 배열 컬럼(`event_types`)은 초기엔 단순하지만, 운영 단계에서 누락/중복/정렬 문제를 자주 만든다.
- `comp_evt_cfg`로 분리하면 종목 단위 유니크/정렬/사용여부를 명확히 관리할 수 있다.
- 참가 테이블(`comp_reg_rel`)을 `comp_evt_id`로 연결하면 사용자가 어떤 코스에 참가했는지 정확히 추적된다.
- 외부 수집 데이터에 종목 정보가 비어 있어도 운영자가 대회별 종목을 후입력하기 쉽다.
- 대회 목록 화면에서 `10K, HALF` 같은 표시를 안정적으로 제공할 수 있다(매번 문자열 파싱 불필요).

### `team_comp_plan_rel` (팀별 대회 운영 컨텍스트)
같은 대회라도 팀별 공지/참가운영 상태를 별도로 관리한다.

필수 컬럼:
- `team_comp_id` (PK)
- `team_id` (FK -> `team_mst`)
- `comp_id` (FK -> `comp_mst`)
- `note_txt` (nullable)
- `vers`, `del_yn`, `crt_at`, `upd_at`

유니크:
- (`team_id`, `comp_id`, `vers`)

행 생성·수명(운영 정책, 2026-04 기준):
- **팀이 해당 대회에 참가 맥락을 가질 때만** `(team_id, comp_id, vers=0)` 행이 존재한다. 앱에서는 **최초 참가 신청(`comp_reg_rel` insert) 직전**에 해당 조합의 행이 없으면 `team_comp_plan_rel`을 한 건 생성한다(`ensureTeamCompPlanRel`).
- 관리자가 **`comp_mst`에 대회만 등록**하는 경우 **`team_comp_plan_rel`은 만들지 않는다.** (전역 카탈로그 ≠ 팀 참가)
- **개인 기록(`rec_race_hist`) 저장은 팀 참가와 연동하지 않는다.** 기록만 올리는 경로는 `comp_reg_rel`/`team_comp_plan_rel`을 건드리지 않는다.
- **“팀이 참가한 대회 수”**는 해당 팀에 대해 `vers=0`·`del_yn=false`인 **`team_comp_plan_rel` 행 수**로 보면 된다(고아 플랜 제거 후 `comp_reg_rel`이 없는 플랜 행은 DB에 남기지 않음. `comp_reg_rel` 행이 남아 있으면 FK 때문에 플랜을 지울 수 없으므로, 소프트삭제된 참가만 있는 경우 등은 별도 정리 정책이 필요할 수 있다).
- v2 초기 **P5 백필**은 레거시 `competition` 전량에 기본 팀 플랜을 넣는 절차였다. 이후 **`20260419120000_team_comp_plan_rel_teammate_insert_and_prune.sql`** 에서 `comp_reg_rel`이 한 건도 없는 플랜은 삭제하고, 팀 소속 멤버가 플랜 행을 INSERT할 수 있는 RLS(`team_comp_plan_rel_insert_teammate`)를 추가했다. 과거 문서의 “P5 완료 후 플랜 건수 = competition 건수” 검증은 **이 정책 적용 후에는 성립하지 않을 수 있다.**

### `comp_reg_rel` (대회 참가 관계)
개인의 참가 등록을 팀 컨텍스트와 연결한다.

필수 컬럼:
- `comp_reg_id` (PK)
- `team_comp_id` (FK -> `team_comp_plan_rel`)
- `mem_id` (FK -> `mem_mst`)
- `comp_evt_id` (FK -> `comp_evt_cfg`, nullable)
- `prt_role_cd` (participant/cheering/volunteer)
- `vers`, `del_yn`, `crt_at`, `upd_at`

유니크:
- (`team_comp_id`, `mem_id`, `vers`)

비고:
- `comp_mst`는 팀과 분리된 전역 대회 마스터로 유지한다.
- 팀별 참가 운영(플랜·참가자 목록 등)은 `team_comp_plan_rel` + `comp_reg_rel` 조합으로 관리한다. 플랜 행 자체는 “카탈로그 전체”가 아니라 **참가가 생긴 대회에 한해** 둔다(위 `team_comp_plan_rel` 절 참고).
- `raw_json`은 v2 대상에서 제거한다.
- 팀 간 참가 데이터는 기본적으로 공유하지 않는다(팀 스코프 분리).
- 동일 사용자가 여러 팀에 노출하고 싶으면 선택한 팀 수만큼 `comp_reg_rel`을 생성한다.
- `note_txt`는 팀 내부 메모(공지 초안/집결 포인트/운영 코멘트) 정리용 선택 컬럼이다.
- `comp_reg_rel`은 삭제(`del_yn`)를 취소 의미로 사용하며 별도 참가 상태코드를 두지 않는다.

코드그룹(초안):
- `COMP_SPRT`: ROAD_RUN, TRAIL_RUN, TRIATHLON, CYCLING
- `COMP_EVT`: 5K, 10K, 15K, HALF, FULL, 50K, 100K, 100M

## 3) 기록 도메인

### `rec_race_hist`
개인 기록을 개인 귀속으로 관리한다(팀 비공유 원칙 적용 안 함).

컬럼(현행 DDL 기준):
- `race_result_id` (PK)
- `mem_id` (FK -> `mem_mst`, NOT NULL)
- `comp_id` (FK -> `comp_mst`, **NOT NULL**, 삭제 시 RESTRICT)
- `comp_evt_id` (FK -> `comp_evt_cfg`, **NOT NULL**, 삭제 시 RESTRICT)
- `rec_time_sec`, `race_nm`, `race_dt` (NOT NULL 기록 식별용)
- `swim_time_sec`, `bike_time_sec`, `run_time_sec` (선택)
- `rec_src_cd` (manual/imported/api, 선택)
- `crt_at`, `upd_at`

**`race_nm`의 위치:** AS-IS `race_name` **자유 입력** 이력을 그대로 옮긴 컬럼이다. 초기에는 대회 마스터 선택 없이 입력되어 `comp_mst.comp_nm`과 문자열이 어긋나기 쉽다. 장기적으로는 `comp_id`·`comp_evt_id` 정합 후 **`race_nm` 중복을 제거**(컬럼 DROP 검토)하고, 표시명은 **`comp_mst` 조인·VIEW**로 두는 방향이 `mem_nm` 비정규화를 피하는 것과 같은 논리다. 상세 절차는 `database-schema-v2-migration-map.md` §3.4 “데이터 정합 후 운영 방향”.

인덱스:
- (`mem_id`, `race_dt`)
- (`comp_evt_id`, `rec_time_sec`)

제약:
- 개인 기록은 참가(`comp_reg_rel`)와 별도 관리한다. **기록 저장 앱 동작은 `comp_reg_rel`·`team_comp_plan_rel`을 자동 생성하지 않는다.**
- `comp_id`/`comp_evt_id`는 항상 채운다. 앱은 기록 등록 시 대회를 선택하고, 해당 `comp_id`에 맞는 `comp_evt_cfg` 행이 없으면 서버(서비스 롤)에서 `comp_evt_cfg`를 추가한 뒤 `rec_race_hist`를 삽입한다.
- 중복 입력 방지를 위해 개인+경기 식별 유니크를 둔다(예: `mem_id`, `comp_evt_id`, `race_dt`, `race_nm`).

노출 정책(현재):
- 기록은 개인 원본 기준으로 관리하며, 현재는 팀별 노출 제어 테이블 없이 소속 팀 화면(예: 랭킹)에서 공통 노출한다.
- 추후 "특정 팀에만 노출/비노출" 요구가 생기면 팀-기록 노출 관계 테이블을 별도로 추가해 확장한다.

### `rec_pb_mat`
개인 최고기록 물리 테이블(선택) 또는 뷰/머터리얼라이즈드 뷰.

권장:
- 우선은 뷰로 시작하고 성능 이슈 시 물리화

## 4) 회비 도메인

### 4.0 설계 취지·테이블 역할 요약
소규모 크루 운영에 맞게 **월마감·월별 상태 원장** 없이도 동작하도록 한다. 화면과 정산의 핵심 질문은 **"얼마 냈는가 / 지금 얼마 내야 하는가"**이며, 이는 회원별 누적 잔액(`fee_mem_bal_snap.bal_amt`, +예치·−미납)으로 표현한다.

| 테이블 | 역할 |
|--------|------|
| `fee_xlsx_upd_hist` | 엑셀 파일 단위 업로드 이력·해시·상태(롤백 등). 동일 파일 재업로드 차단. |
| `fee_txn_hist` | 은행 파일에서 파싱한 **원시 거래 행** 보존. 입출금·매칭·분류·관리자 확정 전 단계까지. |
| `fee_policy_cfg` | 팀별 **월 회비 단가** 등 기간 적용 정책. |
| `fee_due_pay_hist` | 회비 명목으로 **확정된 입금만** 담는 납부 원장(물품·행사비 등 비회비는 여기 넣지 않음). |
| `fee_due_exm_cfg` | 회원별 **면제 규칙**(전액/부분·적용 기간·사유). 화면에서 회원 선택 후 등록. |
| `fee_due_exm_hist` | 정산 시 **실제로 면제로 반영된 금액** 감사 이력(수동·자동 규칙 구분). |
| `fee_mem_bal_snap` | 회원별 **누적 잔액 스냅샷**. 매번 전체 재계산하지 않고 증분 시 워터마크 활용. |

핵심 원칙(원시·확정 분리):
- `fee_txn_hist`: 모든 거래(회비·비회비·출금). **회비 산출은 이 테이블만 보고 하지 않는다.**
- `fee_due_pay_hist`: 회비(`fee_item_cd = due`)로 확정된 건만 반영한 **회비 전용 원장**.
- 예금주 별도 설정 컬럼은 두지 않는다. 요구사항 문서 기준으로 **`mem_mst.mem_nm`과 `raw_name`(엑셀 `내용`) 공백 제거 후 완전 일치**로 자동 매칭 시도한다.

### 4.1 통합 정산·운영 로직
**데이터 흐름**
1. 모임장이 엑셀 업로드 → `fee_xlsx_upd_hist` 1건 + 행별 `fee_txn_hist` 적재  
2. 파서·서비스가 입출금·거래구분에 따라 `fee_item_cd` 후보 설정(최종은 관리자 확정)  
3. 자동 매칭: `match_st_cd` 갱신, 동명이인은 `ambiguous`, 미매칭은 `unmatched`  
4. 관리자 확정(`is_cfm_yn`, `mem_id`, `fee_item_cd`) 후, 회비 건만 `fee_due_pay_hist`에 반영(선택적으로 원시행 FK `src_txn_id`로 연결)  
5. 면제: 관리자가 등록한 규칙은 `fee_due_exm_cfg`. 정산 실행 시 규칙·가입일·회비 단가로 면제액을 산출하고, 감사용으로 `fee_due_exm_hist`에 반영 내역 저장(자동 규칙·수동 동일)  
6. **"회비 재계산" 버튼(수동 배치)**: `fee_due_pay_hist`·`fee_due_exm_hist`·기존 `fee_mem_bal_snap`을 이용해 증분 또는 전체 재생성  

**잔액 의미**  
- `bal_amt = (확정 납부 누적 + 면제로 깎인 부과 누적 반영) − (가입일·정책 기준 부과 누적)` 형태로 서비스 레이어에서 정의한다.  
- **부과 시작 월·당월 면제**(가입 당월 0원 등)는 `team_mem_rel`·팀 규칙과 `fee_due_exm_cfg`의 조합으로 계산한다(세부 식은 구현 단계 문서).  

**증분 계산·오류**  
- 스냅샷이 있으면 워터마크(`last_calc_dt`, `last_ref_pay_id`, `last_ref_exm_hist_id`) 이후만 반영한다.  
- 워터마크 **이전** 날짜의 확정 납부·면제가 새로 끼어 들어오면 **오류 반환**(데이터 역행). 과거 정정은 **스냅샷 초기화 후 전 구간 재계산** 경로로만 허용한다.  

**자동 면제(참석 횟수 등)**  
- 조건 판정·집계는 **DB가 아닌 서비스**에서 수행한다(`evt_team_attd_rel` 등 조회). 충족 시 `fee_due_exm_hist`를 생성하거나 `fee_due_exm_cfg`를 갱신하는 정책은 팀별로 선택한다.  

### 4.2 입금내역 MVP 흐름
회비 시스템의 운영 진입점은 "입금내역 수집·확정"이다.

- 회비 반영은 관리자 확정 이후에만 수행한다.
- 동명이인/미매칭 건은 자동 확정하지 않는다.

기본 흐름:
1. 엑셀 업로드
2. 거래 원시행 저장 (`fee_txn_hist`)
3. 자동 매칭 시도
4. 관리자 수동 확정(회원·카테고리)
5. 회비 건만 `fee_due_pay_hist` 반영 후, 필요 시 재계산으로 `fee_mem_bal_snap` 갱신

### `fee_xlsx_upd_hist` (엑셀 업로드 이력)
**역할:** 업로드 단위를 추적하고 동일 파일 재업로드를 막으며, 롤백 단위를 식별한다.

필수 컬럼:
- `upd_id` (PK)
- `team_id` (FK -> `team_mst`)
- `file_nm`
- `file_hash` (동일 파일 중복 방지)
- `upd_by_mem_id` (FK -> `mem_mst`)
- `upd_st_cd` (pending/confirmed/rolled_back)
- `crt_at`, `upd_at`, `del_yn`, `vers`

유니크:
- (`team_id`, `file_hash`, `vers`)

### `fee_txn_hist` (은행 원시 거래 이력)
**역할:** 업로드 파일에서 파싱한 **원본 거래 한 줄**을 보존한다. 입금/출금·매칭·분류·확정 여부는 모두 여기서 관리하며, **회비 잔액·미납 표시는 이 테이블을 직접 집계하지 않는다**(확정 후 `fee_due_pay_hist`·스냅샷 사용).
원시 은행 거래는 수정 대상이 아니므로 append-only(불변)로 관리한다.

필수 컬럼:
- `txn_id` (PK)
- `team_id` (FK -> `team_mst`)
- `upd_id` (FK -> `fee_xlsx_upd_hist`)
- `txn_dt` (거래일)
- `txn_tm` (거래시각, nullable)
- `txn_amt` (절대값 금액)
- `txn_io_enm` (enum: `deposit`/`withdrawal`)
- `raw_name` (xlsx `내용`)
- `raw_memo` (nullable, xlsx `메모` 원문)
- `adm_memo_txt` (nullable, 관리자 운영 메모: 지출 제목·설명 등)
- `txn_tp_txt` (xlsx 거래구분 원문)
- `match_st_cd` (matched/unmatched/ambiguous)
- `mem_id` (FK -> `mem_mst`, nullable)
- `fee_item_cd` (공통코드: `due`/`expense`/`event_fee`/`goods`/`other`, nullable)
- `is_cfm_yn` (관리자 확정 여부)
- `cfm_by_mem_id` (FK -> `mem_mst`, nullable)
- `cfm_at` (nullable)
- `crt_at`, `upd_at`, `del_yn`

유니크(거래 중복 방지):
- (`team_id`, `txn_dt`, `txn_tm`, `txn_amt`, `raw_name`)

비고:
- `raw_name` 유니크 제약은 두지 않는다.
- 같은 이름이 여러 명일 수 있으므로 `match_st_cd = ambiguous`로 남겨 수동 확정한다.
- 입출금 방향은 공통코드가 아닌 enum(`txn_io_enm`)으로 관리한다.
- `raw_memo`는 은행 파일 그대로 두고, 화면용 설명은 `adm_memo_txt`에만 기록한다.
- 출금은 요구사항상 지출 후보로 두고 `fee_item_cd = expense` 등으로 분류한다(최종 확정은 관리자).
- 원시 거래 정정이 필요하면 UPDATE 대신 정정 이력을 추가하거나 업로드 롤백/재처리로 대응한다.

### `fee_policy_cfg`
**역할:** 팀별 **월 회비 단가** 등 기간 적용 규칙. 정산 시 `pay_dt`·부과월이 속하는 구간의 `monthly_fee_amt`를 조회한다.

필수 컬럼:
- `fee_policy_id` (PK)
- `team_id` (FK -> `team_mst`)
- `aply_stt_dt`, `aply_end_dt` (적용시작일/적용종료일)
- `monthly_fee_amt`
- `vers`, `del_yn`, `crt_at`, `upd_at`

체크:
- `monthly_fee_amt > 0`
- 기간 중복 금지(exclusion 또는 서비스 레이어 검증)

비고:
- 정책 활성/종료 상태 컬럼은 두지 않고, 기간(`aply_stt_dt ~ aply_end_dt`)으로만 적용 여부를 판단한다.

### `fee_due_pay_hist` (확정 회비 납부 원장)
**역할:** 회비로 **확정된 입금만** 담는다. 물품·이벤트비·지출 등 비회비는 `fee_txn_hist`에서만 보며 이 테이블에 넣지 않는다. 화면의 "얼마 냈는가" 핵심 근거.

모델 결정:
- 구성: `fee_txn_hist`(원시거래) + `fee_due_pay_hist`(확정 납부원장)

필수 컬럼:
- `pay_id` (PK)
- `team_id` (FK -> `team_mst`)
- `mem_id` (FK -> `mem_mst`)
- `src_txn_id` (FK -> `fee_txn_hist`, nullable, 원시행 추적·감사용)
- `pay_amt`, `pay_dt`
- `pay_st_cd` (paid/cancelled/refunded)
- `vers`, `del_yn`, `crt_at`, `upd_at`

비고:
- 정책 FK를 두지 않고, `pay_dt`가 `fee_policy_cfg.aply_stt_dt ~ aply_end_dt` 범위에 포함되는 정책을 조회해 정산/산출에 사용한다.
- `fee_due_pay_hist`는 이체 거래내역 기반의 확정 납부원장으로 관리한다.
- `fee_due_pay_hist`에는 회비(`fee_item_cd = due`) 확정 건만 반영한다.
- 취소·환불 처리 시 `pay_st_cd`로 구분한다.

인덱스:
- (`team_id`, `pay_dt`)
- (`mem_id`, `pay_dt`)

### `fee_due_exm_cfg` (회비 면제 규칙)
**역할:** 회원별 면제 **정책**(전액/부분·적용 기간·사유). 매달 2천원만 면제, 매달 전액 면제, 기간마다 금액 변경 등은 **기간이 겹치지 않게 cfg를 여러 건** 두거나 기간을 나눠 표현한다.

필수 컬럼:
- `exm_cfg_id` (PK)
- `team_id` (FK -> `team_mst`)
- `mem_id` (FK -> `mem_mst`)
- `exm_tp_enm` (enum: `full` 전액면제 / `part` 정액면제)
- `exm_amt` (nullable, `part`일 때 해당 기간 applied monthly 면제액 등; `full`이면 월회비 전액 면제로 해석)
- `aply_stt_dt`, `aply_end_dt` (규칙 적용 기간)
- `rsn_txt` (면제 사유)
- `reg_by_mem_id` (FK -> `mem_mst`, 등록자)
- `vers`, `del_yn`, `crt_at`, `upd_at`

체크:
- `aply_stt_dt <= aply_end_dt`
- 동일 `team_id`,`mem_id`에서 적용 기간이 논리적으로 중복되지 않도록 서비스에서 검증

### `fee_due_exm_hist` (회비 면제 적용 이력)
**역할:** 정산 실행 시 **실제로 잔액/부과 계산에 반영된 면제**를 남긴다(감사·증분 워터마크). 수동 등록 규칙·자동 규칙(참석 횟수 등) 모두 동일 테이블에 기록할 수 있다.

필수 컬럼:
- `exm_hist_id` (PK)
- `team_id` (FK -> `team_mst`)
- `mem_id` (FK -> `mem_mst`)
- `exm_cfg_id` (FK -> `fee_due_exm_cfg`, nullable, 일회성 조정 시 null)
- `aply_ym` (text, `YYYY-MM`, 면제가 적용된 **회비 기준월**)
- `exm_amt` (해당 월에 반영한 면제액)
- `grant_src_enm` (enum: `manual` | `rule_attd` 등, 자동·수동 구분)
- `rsn_txt` (nullable, 표시용 보조 설명)
- `aprv_by_mem_id` (FK -> `mem_mst`, nullable)
- `aprv_at` (nullable)
- `vers`, `del_yn`, `crt_at`, `upd_at`

유니크:
- 동일 월·동일 출처의 중복 반영 방지 규칙은 팀 정책에 맞게 설계한다(예: `(team_id, mem_id, aply_ym, exm_cfg_id)` 부분 유니크는 `del_yn` 정책과 함께 검토).

비고:
- 장기적으로 금액·전액/부분이 바뀌는 경우에도 **cfg 이력 분할**로 표현 가능; hist는 **실제 반영분**만 적는다.

### `fee_mem_bal_snap` (회원별 회비 누적 스냅샷)
**역할:** 회원별 **누적 잔액**(+예치·−미납)을 저장해 매 요청마다 긴 구간을 재합산하지 않게 한다. 자동 배치 없이 **화면의 "재계산"** 등으로 갱신.

필수 컬럼:
- `bal_snap_id` (PK)
- `team_id` (FK -> `team_mst`)
- `mem_id` (FK -> `mem_mst`)
- `bal_amt` (현재 잔액, +면 예치금 / -면 미납)
- `last_calc_dt` (마지막 누적 계산 기준일)
- `last_calc_at` (마지막 누적 계산 시각)
- `last_ref_pay_id` (마지막 반영 `fee_due_pay_hist.pay_id`, nullable)
- `last_ref_exm_hist_id` (마지막 반영 `fee_due_exm_hist.exm_hist_id`, nullable)
- `vers`, `del_yn`, `crt_at`, `upd_at`

유니크:
- (`team_id`, `mem_id`, `vers`)

정산 규칙:
- 스냅샷이 있으면 `last_calc_dt` 다음 일자부터 증분 계산한다.
- 예: 스냅샷 기준일이 `2026-02-01`이면, `2026-02-02 ~ 실행일` 구간만 누적 반영한다.
- 스냅샷 기준일 이전(`pay_dt < last_calc_dt`) 데이터가 신규 반영 대상에 포함되면 오류를 반환한다.
- 과거 정정이 필요한 경우 "스냅샷 재생성(초기화 후 전체 재계산)" 경로로만 처리한다.
- 면제 반영이 pay와 다른 키로 쌓이므로 증분 시 **`fee_due_exm_hist` 미반영분**도 워터마크(`last_ref_exm_hist_id` 등)와 함께 고려한다(실제 구현은 단일 시퀀스·시각으로 단순화 가능).

## 5) 팀 이벤트/칭호 도메인

- **칭호 도메인**: `database-schema-v2-title-domain.md` 참조. `ttl_mst` / `mem_ttl_rel` 테이블, `TTL_CTGR_CD` 코드그룹, `ttl_kind_enm` enum 정의 포함. 팀 스코프 + 자동/수여 구분 + 동적 포인트 계산 정책을 본 문서 §1·§6 멀티팀 규약에 맞춰 정리했다.
- **팀 이벤트 도메인**: 마일리지런(`evt_mlg_*`) 외 일반 팀 이벤트(`evt_team_mst`, `evt_team_prt_rel` 등 약어 사전 정의분)는 작성 보류. 요구 확정 후 별도 문서로 추가한다.

## 6) 관계 요약
- `mem_mst 1:N team_mem_rel`
- `team_mst 1:N team_mem_rel`
- `team_mst 1:N team_comp_plan_rel`
- `comp_mst 1:N comp_evt_cfg`
- `comp_mst 1:N team_comp_plan_rel`
- `team_comp_plan_rel 1:N comp_reg_rel`
- `mem_mst 1:N comp_reg_rel`
- `mem_mst 1:N rec_race_hist`
- `team_mst 1:N fee_policy_cfg`
- `team_mst 1:N fee_xlsx_upd_hist`
- `mem_mst 1:N fee_xlsx_upd_hist` (via `upd_by_mem_id`)
- `fee_xlsx_upd_hist 1:N fee_txn_hist`
- `team_mst 1:N fee_txn_hist`
- `mem_mst 1:N fee_txn_hist` (via `mem_id`, nullable)
- `fee_txn_hist 1:1 또는 N:1 fee_due_pay_hist` (via `src_txn_id`, nullable)
- `team_mst 1:N fee_due_pay_hist`
- `mem_mst 1:N fee_due_pay_hist`
- `team_mst 1:N fee_due_exm_cfg`
- `mem_mst 1:N fee_due_exm_cfg`
- `team_mst 1:N fee_due_exm_hist`
- `mem_mst 1:N fee_due_exm_hist`
- `fee_due_exm_cfg 1:N fee_due_exm_hist`
- `team_mst 1:N fee_mem_bal_snap`
- `mem_mst 1:N fee_mem_bal_snap`
- `team_mst 1:N ttl_mst`
- `team_mst 1:N mem_ttl_rel`
- `mem_mst 1:N mem_ttl_rel`
- `ttl_mst 1:N mem_ttl_rel`

## 7) 운영상 이점
- 회비는 원시(`fee_txn_hist`)·확정(`fee_due_pay_hist`)·면제(cfg/hist)·스냅샷으로 역할이 나뉘어 소규모 운영에 맞는 단순함과 감사 추적을 동시에 확보한다.
- 멀티팀에서도 개인 기록 중복이 없다.
- 팀별 운영 데이터만 분리되어 권한/RLS 적용이 단순해진다.
- 회비 같은 신규 기능이 팀 스코프로 독립 확장 가능하다.
- 기록은 개인 원본으로 분리해 팀 컨텍스트 변화와 독립적으로 보존된다.

## 8) PR 리뷰 포인트 (혼동 방지)
- 회비 잔액은 `fee_txn_hist`가 아니라 `fee_due_pay_hist`·면제·스냅샷 조합으로 본다. 원시 테이블은 확정 전·비회비 거래를 포함한다.
- 면제 **규칙**(`fee_due_exm_cfg`)과 **반영 이력**(`fee_due_exm_hist`)을 섞지 말 것. 자동·수동 면제의 판정은 서비스, 결과 기록은 DB.
- 왜 팀코드를 모든 테이블에 넣지 않았는가?
  - 개인 기록 중복/누락을 막기 위해 전역 원본 + 팀 관계 분리로 설계함.
- `inactive`와 `del_yn` 차이는 무엇인가?
  - `inactive`: 업무 상태, `del_yn`: 논리 삭제 플래그.
- 팀별로 다른 프로필/정책이 필요하면 가능한가?
  - 가능하며, 필요 시점에 팀별 오버라이드 테이블을 별도 설계해 추가함.

## 9) UI/운영 사용 메모
- 참가 신청 UI에서 `공개 팀 범위`를 선택할 수 있게 한다.
  - 기본값: `현재 팀만`
  - 옵션: `내 소속 팀 선택` (복수 선택)
- 저장 로직:
  - 현재 팀만 선택 시 `comp_reg_rel` 1건 생성
  - 복수 팀 선택 시 팀별 `team_comp_id`로 `comp_reg_rel` 다건 생성
- 이 메모는 DB 구조를 어떻게 UX로 연결하는지 설명하기 위한 참고이며, 상세 화면 스펙은 추후 UI 문서에서 확정한다.
