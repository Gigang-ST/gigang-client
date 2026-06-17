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
| `stt` | start 시작 (일시는 `stt_at`, 날짜는 `stt_dt`) |
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
| `fdbk` | feedback (건의/피드백) |
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
| `desc` | description (설명) |
| `ord` | order (정렬 순서) |
| `prmy` | primary (대표) |
| `rsn` | reason (사유) |
| `calc` | calculation (계산) |
| `bsis` | basis (근거) |
| `grnt` | grant/granted (부여) |
| `exp` | expire/expires (만료) |
| `chg` | change (변경) |
| `brd` | board (게시판) |
| `noti` | notification (알림) |
| `cont` | content (본문 내용) |
| `pref` | preference (수신 설정) |
| `pin` | pinned (상단 고정) |
| `read` | read (읽음 여부) |
| `ref` | reference (연관 리소스 참조) |
| `writ` | writer (작성자) |
| `gthr` | gathering (모임) |
| `sch` | schedule (일정 공유) |
| `cmnt` | comment (댓글) |
| `prnt` | parent (부모, 대댓글 계층) |
| `cont` | content (본문, 단독 텍스트 컬럼은 `cont_txt`) |
| `loc`  | location (장소, 컬럼은 `loc_txt` / `loc_nm`) |
| `attd` | attendance (참석, 이미 등록됨 — 모임 참석에 재사용) |

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
| `brd_post_mst` | 게시글 마스터 (공지/업데이트) |
| `brd_post_read_hist` | 게시글 읽음 이력 |
| `noti_mst` | 알림 마스터 |
| `noti_pref_cfg` | 알림 수신 설정 |
| `gthr_mst` | 모임 마스터 |
| `gthr_attd_rel` | 모임 참석 관계 |
| `gthr_cmnt_mst` | 모임 댓글 |
| `sch_post` | 일정 공유 게시물 (러닝 소식/이벤트/대회접수 등) |
| `fdbk_mst` | 건의/피드백 마스터 |

## sch_post 도메인 컬럼 약어
| 컬럼 | 의미 |
|------|------|
| `sch_post_id` | PK |
| `sch_nm` | 일정명 |
| `evt_stt_at` | 일정 시작 일시 (timestamptz) |
| `evt_end_at` | 일정 종료 일시 (timestamptz, 선택) |
| `url` | 관련 링크 (선택) |
| `cont_txt` | 본문 내용 (선택) |
| `crt_by` | 작성자 mem_id |

## 칭호 도메인 컬럼 약어 (v2)
| 컬럼 | 의미 |
|------|------|
| `ttl_kind_enm` | 칭호 유형 enum (`auto`/`awarded`) |
| `ttl_ctgr_cd` | 칭호 카테고리 코드 |
| `ttl_nm` | 칭호 이름 |
| `ttl_desc` | 칭호 설명 |
| `ttl_rank` | 자동 칭호 등급 |
| `cond_rule_json` | 자동 부여 조건 JSON |
| `base_pt` | 기본 점수 |
| `sort_ord` | 관리자 목록 정렬 순서 |
| `grnt_at` | 부여 시각 |
| `exp_at` | 만료 시각 |
| `grnt_by_mem_id` | 수여자 회원 ID |
| `grnt_pt` | 부여 시점 점수 |
| `aply_pt` | 현재 적용 점수 |
| `pt_calc_at` | 점수 계산 시각 |
| `pt_calc_bsis_json` | 점수 계산 근거 JSON |
| `pt_chg_rsn_cd` | 점수/상태 변경 사유 코드 |
| `grnt_rsn_txt` | 부여 사유 텍스트 |
| `is_prmy_yn` | 대표 칭호 여부 |

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

## 건의 도메인 컬럼 약어 (fdbk_mst)
| 컬럼 | 의미 |
|------|------|
| `fdbk_id` | PK |
| `mem_id` | 작성자 회원 ID (FK → `mem_mst`) |
| `cont_txt` | 건의 본문 텍스트 |
| `stts_enm` | 처리 상태 enum (`open` / `in_review` / `resolved` / `closed`) |
| `adm_note_txt` | 관리자 답변/메모 |
| `rspd_at` | 관리자 답변 일시 |

## 네이밍 통일 규칙
- `usr`는 사용하지 않고 `mem`으로 통일한다.
- `title`은 `ttl`로 통일한다.
- `payment`는 `pay`로 통일한다.
- 공통 메타 컬럼은 `crt_at`, `upd_at`, `del_yn`, `vers`를 기본으로 사용한다.
- `*_cd` 기본 의미는 공통코드 참조다.
- 고정된 폐쇄형 값셋은 `*_enm`을 우선 사용한다.
- 단, `team_cd`처럼 외부/업무 식별 목적의 유니크 코드는 예외로 허용한다.
- 엔터티명 자체를 나타내는 이름 컬럼은 `도메인_nm` 패턴을 사용한다 (예: `sch_nm`, `gthr_nm`, `ttl_nm`). `title_nm`처럼 의미가 중복되는 형태는 사용하지 않는다.
- 일시(timestamptz) 컬럼은 `*_at`, 날짜(date) 컬럼은 `*_dt`로 구분한다.
