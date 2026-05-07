---
paths:
  - "supabase/**/*.sql"
  - "supabase/migrations/**"
  - "supabase/seed.sql"
---

# 데이터베이스 규칙

## 스키마 컨벤션
- prd 기준 스키마 컨벤션 사용 (V2 네이밍 패턴 사용)
- 테이블/컬럼명: snake_case
- 기본키: `uuid` (`gen_random_uuid()` 기본값)
- 감사 컬럼: `created_at`, `updated_at` (`timestamptz`) 필수
- 모든 테이블에 RLS 정책 필수, FK 인덱스 필수

## Supabase 작업 원칙
- **모든 DB 작업은 Supabase MCP 서버를 통해 수행**
- 마이그레이션: `supabase/migrations/` 관리
- 변경 후 `pnpm supabase gen types` 타입 재생성
- 운영 적용 전 개발 환경에서 먼저 검증

## 공통 접미사 약어
| 약어 | 의미 | | 약어 | 의미 |
|------|------|-|------|------|
| `mst` | 마스터(기준 데이터) | | `cd` | 코드 |
| `rel` | 관계 테이블 | | `nm` | 이름 |
| `hist` | 이력 데이터 | | `dt` | 날짜 |
| `cfg` | 설정 | | `at` | 일시 |
| `yn` | 불리언 플래그 | | `amt` | 금액 |
| `enm` | enum (폐쇄형 값셋) | | `stts` | status 상태 |

## 도메인 약어
| 약어 | 의미 | | 약어 | 의미 |
|------|------|-|------|------|
| `mem` | member (회원) | | `mlg` | mileage (마일리지) |
| `team` | team (팀) | | `ttl` | title (칭호) |
| `comp` | competition (대회) | | `pay` | payment (납부) |
| `rec` | record (기록) | | `attd` | attendance (출석) |
| `fee` | fee (회비) | | `prt` | participation (참가) |
| `evt` | event (이벤트) | | `bal` | balance (잔액) |
| `adm` | administrator | | `txn` | transaction |
| `snap` | snapshot | | `exm` | exemption (면제) |
| `due` | due (부과 대상) | | `io` | in/out 방향 |

## 네이밍 통일 규칙
- `usr` 사용 금지 → `mem`으로 통일
- `title` → `ttl`, `payment` → `pay`
- `*_cd` = 공통코드 참조, `*_enm` = 고정 폐쇄형 값셋 우선
- 단, `team_cd`처럼 외부 식별 목적 유니크 코드는 예외 허용

## 전체 테이블 (public schema)

**회원**
| 테이블 | 의미 |
|--------|------|
| `mem_mst` | 회원 마스터 |
| `mem_utmb_prf` | UTMB 프로필 |

**팀**
| 테이블 | 의미 |
|--------|------|
| `team_mst` | 팀 마스터 |
| `team_mem_rel` | 팀-회원 관계 |
| `team_comp_plan_rel` | 팀·대회 참가 맥락 (참가 등록 시에만 행 존재) |

**대회**
| 테이블 | 의미 |
|--------|------|
| `comp_mst` | 대회 마스터 |
| `comp_evt_cfg` | 대회 종목 설정 |
| `comp_reg_rel` | 대회 참가 |
| `rec_race_hist` | 기록 이력 |

**회비**
| 테이블 | 의미 |
|--------|------|
| `fee_policy_cfg` | 회비 정책 |
| `fee_xlsx_upd_hist` | 회비 엑셀 업로드 이력 |
| `fee_txn_hist` | 은행 원시 거래 이력 |
| `fee_due_pay_hist` | 확정 회비 납부 원장 |
| `fee_due_exm_cfg` | 회비 면제 규칙 |
| `fee_due_exm_hist` | 회비 면제 적용 이력 |
| `fee_mem_bal_snap` | 회원 회비 누적 스냅샷 |

**이벤트 / 마일리지**
| 테이블 | 의미 |
|--------|------|
| `evt_team_mst` | 팀 이벤트 마스터 |
| `evt_team_prt_rel` | 이벤트 참가 (참가자 기준 루트) |
| `evt_mlg_mth_snap` | 마일리지 월별 목표·집계 스냅샷 |
| `evt_mlg_act_hist` | 마일리지 활동 기록 이력 |
| `evt_mlg_mult_cfg` | 마일리지 배율 설정 |

**공통코드**
| 테이블 | 의미 |
|--------|------|
| `cmm_cd_grp_mst` | 공통코드 그룹 마스터 |
| `cmm_cd_mst` | 공통코드 마스터 |
