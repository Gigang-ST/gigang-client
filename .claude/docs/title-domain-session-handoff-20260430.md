# 칭호 도메인 세션 이력 (2026-04-30)

집/다음 세션에서 바로 이어서 작업할 수 있도록, 오늘 합의한 설계 결정을 정리한다.

## 1) 스코프 결정
- 칭호 도메인은 우선 `ttl_mst`, `mem_ttl_rel` 2개 테이블로 시작한다.
- 팀별 칭호 카탈로그(`ttl_mst`)와 회원 보유/이력(`mem_ttl_rel`)을 분리한다.
- 팀별 정합성은 `team_mem_id` FK + `team_id, ttl_id` FK로 강제한다.

## 2) FK/정합성 결정
- `mem_ttl_rel(team_mem_id)` -> `team_mem_rel(team_mem_id)`
- `mem_ttl_rel(team_id, ttl_id)` -> `ttl_mst(team_id, ttl_id)`
- 목표:
  - 타 팀 칭호 오부여 차단
  - 팀 미소속 회원 부여 차단

## 3) 메타/네이밍 결정
- 공통 메타는 `crt_at`, `upd_at`, `del_yn`, `vers` 사용.
- `created_at`/`updated_at` 사용 금지.
- 정렬 컬럼은 `disp_ord`가 아니라 `sort_ord` 사용.
- 칭호 컬럼 토큰은 4글자 이내 약어 기준으로 통일:
  - `granted_*` -> `grnt_*`
  - `expires_at` -> `exp_at`
  - `basis` -> `bsis`

## 4) 점수 정책 결정
- MVP는 고정점수로 출시.
- `mem_ttl_rel.aply_pt`를 랭킹/합산 기준으로 사용.
- 최초 부여 시 `grnt_pt = aply_pt = ttl_mst.base_pt`.
- 희귀도 보정은 즉시 적용이 아닌 **주 1회 배치**로 운영.

## 5) 희귀도 보정 초안
- 권장식: `round(base_pt * sqrt(active_mem_cnt / holder_cnt))`
- 안정장치:
  - `holder_cnt >= 1`
  - 하한/상한 클램프(예: `0.7x ~ 1.8x`)
- 배치 시 기록:
  - `aply_pt`, `pt_calc_at`, `pt_calc_bsis_json`
  - 변경사유 `pt_chg_rsn_cd = rarity_recalc`

## 6) 로그/감사 추적 결정
- `vers=0` 현재값, `vers>0` 이력값.
- 점수/상태 변경은 정본 교체 방식으로 이력 누적(UPDATE 최소화).
- 사용자 로그 표시에 필요한 축:
  - 획득: `grnt_at`, `grnt_by_mem_id`, `grnt_rsn_txt`
  - 점수 변동: `aply_pt`, `pt_calc_at`, `pt_chg_rsn_cd`, `pt_calc_bsis_json`

## 7) 공통코드 결정
- `TTL_CTGR_CD`: 칭호 카테고리
- `TTL_PT_CHG_RSN_CD`: 점수/상태 변경 사유
  - 예: `initial_grant`, `rarity_recalc`, `manual_adjust`, `expire`, `revoke`

## 8) 오늘 반영 문서
- `database-schema-v2-title-domain.md`
- `database-abbreviation-dictionary.md`
- `database-schema-v2-domains.md`
- `database-schema-v2.md`
- `database-schema-v2-rollout-progress.md`

## 9) 다음 세션 TODO
- 칭호 도메인 DDL 초안 작성 (테이블/제약/인덱스)
- `TTL_CTGR_CD`, `TTL_PT_CHG_RSN_CD` 시드 SQL 초안 작성
- RLS 정책 초안 작성 (조회, 관리자 CUD, 서버 액션 자동부여)
- 주 1회 희귀도 배치 잡 스펙 문서화 (실행 시각, 재시도, 롤백)
