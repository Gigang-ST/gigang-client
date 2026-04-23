# DB 약어 사전 (v1)

## 목적
- 테이블/컬럼 약어를 팀 내에서 일관되게 사용하기 위한 기준 문서.
- 신규 테이블 설계 시 본 문서의 약어를 우선 사용한다.

## 공통 접미사
| 약어 | 의미 |
|------|------|
| `mst` | 마스터(기준 데이터) |
| `rel` | 관계 테이블 |
| `hist` | 이력 데이터 |
| `cfg` | 설정 |
| `cd` | 코드 |
| `nm` | 이름 |
| `dt` | 날짜 |
| `at` | 일시 |
| `stt` | start 시작 |
| `stts` | status 상태 |
| `aply` | apply 적용 |
| `aprv` | approve 승인 |
| `yn` | 불리언 플래그 |
| `amt` | 금액 |
| `mth` | month 월 |
| `id` | 식별자 |

## 도메인 약어
| 약어 | 의미 |
|------|------|
| `mem` | member (회원) |
| `team` | team (팀) |
| `comp` | competition (대회) |
| `rec` | record (기록) |
| `fee` | fee (회비) |
| `evt` | event (이벤트) |
| `mlg` | mileage (마일리지) |
| `sprt` | sport (종목/스포츠) |
| `ttl` | title (칭호) |
| `pay` | payment (납부) |
| `attd` | attendance (출석/참석) |
| `prt` | participation (참가) |
| `src` | source (출처) |
| `io` | in/out 방향 |
| `adm` | administrator (관리자·모임장 입력) |
| `bal` | balance (잔액/누적 상태) |
| `snap` | snapshot (시점 스냅샷) |
| `exm` | exemption (면제) |
| `due` | due (회비 부과·납부 대상) |
| `txn` | transaction (거래) |
| `xlsx` | Excel 업로드 원본 |

## 현재 v2 주요 테이블 약어
| 테이블 | 의미 |
|--------|------|
| `mem_mst` | 회원 전역 마스터 |
| `team_mst` | 팀 마스터 |
| `team_mem_rel` | 팀-회원 관계 |
| `comp_mst` | 대회 마스터 |
| `comp_evt_cfg` | 대회 종목 설정 |
| `team_comp_plan_rel` | 팀·대회 참가 맥락(플랜). 참가(`comp_reg_rel`)가 생길 때만 행 존재; 카탈로그 전체와 1:1 아님 |
| `comp_reg_rel` | 대회 참가 관계 |
| `rec_race_hist` | 기록 이력 |
| `fee_policy_cfg` | 회비 정책 |
| `fee_xlsx_upd_hist` | 회비 엑셀 업로드 이력 |
| `fee_txn_hist` | 은행 원시 거래 이력 |
| `fee_due_pay_hist` | 확정 회비 납부 원장 |
| `fee_due_exm_cfg` | 회비 면제 규칙 |
| `fee_due_exm_hist` | 회비 면제 적용 이력 |
| `fee_mem_bal_snap` | 회원 회비 누적 스냅샷 |
| `evt_team_mst` | 팀 이벤트 마스터 |
| `evt_team_prt_rel` | 이벤트 참가 관계(참가자 기준 루트) |
| `evt_mlg_mth_snap` | 마일리지 월별 목표/집계 스냅샷 |
| `evt_mlg_act_hist` | 마일리지 활동 기록 이력 |
| `evt_mlg_mult_cfg` | 마일리지 배율 설정 |
| `ttl_mst` | 칭호 마스터 |
| `mem_ttl_rel` | 회원-칭호 관계 |

## 마일리지런 컬럼 약어 (현재 기준)
| 컬럼 | 의미 |
|------|------|
| `prt_id` | participation ID (이벤트 참가 식별자) |
| `base_dt` | 기준월 날짜 (`YYYY-MM-01`) |
| `goal_mlg` | 월 목표 마일리지 |
| `achv_yn` | 월 목표 달성 여부 |
| `achv_mlg` | 월 누적 달성 마일리지 |
| `act_cnt` | 월 활동 건수 |
| `lst_act_dt` | 월 마지막 활동일 |
| `sprt_enm` | 종목 enum |
| `dst_km` | 활동 거리(km) |
| `elv_m` | 상승고도(m) |
| `base_mlg` | 배율 적용 전 기본 마일리지 |
| `aply_mults` | 적용 배율 스냅샷(jsonb 배열) |
| `final_mlg` | 배율 적용 후 최종 마일리지 |

## 네이밍 통일 규칙
- `usr`는 사용하지 않고 `mem`으로 통일한다.
- `title`은 `ttl`로 통일한다.
- `payment`는 `pay`로 통일한다.
- `*_cd` 기본 의미는 공통코드 참조다.
- 고정된 폐쇄형 값셋은 `*_enm`을 우선 사용한다.
- 단, `team_cd`처럼 외부/업무 식별 목적의 유니크 코드는 예외로 허용한다.
