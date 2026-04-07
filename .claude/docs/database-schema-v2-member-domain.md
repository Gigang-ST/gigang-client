# 회원 도메인 v2 설계 (Member + TeamMember)

## 1) 설계 배경
- 한 사용자가 여러 팀에 가입할 수 있는 구조를 전제로 설계한다.
- 개인 정보/개인 기록은 전역 1원본으로 유지한다.
- 팀별 권한/역할/활동 상태는 관계 테이블에서 관리한다.
- 팀 간 데이터는 완전 분리하며, 팀 간 교차 조회/공유를 허용하지 않는다.

## 2) 엔터티 정의

### `mem_mst` (회원 전역 마스터)
개인 자체의 정체성과 프로필 원본을 관리한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `mem_id` | `uuid` | Y | PK, `auth.users.id`와 1:1 |
| `mem_nm` | `text` | Y | 회원명 |
| `gdr_enm` | `enum` | N | 성별 enum |
| `birth_dt` | `date` | N | 생년월일 |
| `phone_no` | `text` | N | 전화번호 |
| `email_addr` | `text` | N | 이메일(유니크) |
| `bank_nm` | `text` | N | 계좌 은행명 |
| `bank_acct_no` | `text` | N | 계좌번호(정규화 저장값) |
| `avatar_url` | `text` | N | 프로필 이미지 URL |
| `oauth_kakao_id` | `uuid` | N | 카카오 사용자 ID(유니크) |
| `oauth_google_id` | `uuid` | N | 구글 사용자 ID(유니크) |
| `vers` | `int` | Y | 기본값 1 |
| `del_yn` | `boolean` | Y | 기본값 false |
| `crt_at` | `timestamptz` | Y | 기본값 now() |
| `upd_at` | `timestamptz` | Y | 기본값 now() |

핵심 제약:
- `pk_mem_mst` (`mem_id`)
- `fk_mem_mst__auth_users` (`mem_id` → `auth.users(id)`, `ON DELETE RESTRICT`) — 웨이브2 DDL. 백필 중 일시 `DROP` 할 수 있음; prd 컷오버 시 재부착 절차는 `database-schema-v2-rollout-progress.md` **§5.6**·`scripts/sql/prd_cutover_mem_mst_fk_auth.sql`
- `uk_mem_mst_email_addr` (`email_addr`, `vers`)
- `uk_mem_mst_oauth_kakao_id` (`oauth_kakao_id`, `vers`)
- `uk_mem_mst_oauth_google_id` (`oauth_google_id`, `vers`)

### `team_mst` (팀 마스터)
팀 자체의 기준정보를 관리한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `team_id` | `uuid` | Y | PK |
| `team_cd` | `text` | Y | 팀 외부 식별 코드(유니크, URL/운영 식별용) |
| `team_nm` | `text` | Y | 팀명 |
| `vers` | `int` | Y | 기본값 1 |
| `del_yn` | `boolean` | Y | 기본값 false |
| `crt_at` | `timestamptz` | Y | 기본값 now() |
| `upd_at` | `timestamptz` | Y | 기본값 now() |

비고:
- `team_id`: 내부 참조용 PK(UUID). FK 연결과 조인에 사용한다.
- `team_cd`: 외부/업무 식별 코드(유니크). 관리자 화면, URL, 운영 식별자에 사용한다.
- 현재 단계에서는 `team_st_cd`를 두지 않는다(팀 수가 적고 비활성/보관 운영 요구가 없음).

### `mem_utmb_prf` (회원 UTMB 프로필 확장)
`mem_mst`와 **1:1**(정본 `vers = 0`)인 선택적 부가 정보. 레거시 `utmb_profile` 대응.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `utmb_prf_id` | `uuid` | Y | PK. 레거시 `utmb_profile.id` 백필 시 동일 값 유지 |
| `mem_id` | `uuid` | Y | FK → `mem_mst.mem_id` |
| `utmb_prf_url` | `text` | Y | UTMB 프로필 URL (`utmb_profile.utmb_profile_url`) |
| `utmb_idx` | `int` | Y | UTMB 인덱스, `>= 0` |
| `rct_race_nm` | `text` | N | 최근 대회명 (`utmb_profile.recent_race_name`) |
| `rct_race_rec` | `text` | N | 최근 대회 기록 (`utmb_profile.recent_race_record`) |
| `vers` | `int` | Y | 기본값 0(정본) |
| `del_yn` | `boolean` | Y | 기본값 false |
| `crt_at` | `timestamptz` | Y | 기본값 now() |
| `upd_at` | `timestamptz` | Y | 기본값 now(), `set_v2_upd_at` |

핵심 제약:
- `pk_mem_utmb_prf` (`utmb_prf_id`)
- `fk_mem_utmb_prf__mem_mst` (`mem_id` → `mem_mst`)
- `uk_mem_utmb_prf_mem_vers` (`mem_id`, `vers`)
- `ck_mem_utmb_prf_utmb_idx` (`utmb_idx >= 0`)

비고:
- `rct_race_nm`, `rct_race_rec`는 `20260406190000_v2_mem_utmb_prf_add_recent_race_cols.sql`로 추가되며,
  레거시 `utmb_profile.recent_race_*`를 `utmb_prf_id = utmb_profile.id` 기준으로 백필한다.

### `team_mem_rel` (팀-회원 관계)
다중 소속/팀별 권한/팀별 가입상태를 관리한다.

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `team_mem_id` | `uuid` | Y | PK |
| `team_id` | `uuid` | Y | FK -> `team_mst.team_id` |
| `mem_id` | `uuid` | Y | FK -> `mem_mst.mem_id` |
| `team_role_cd` | `text` | Y | owner/admin/member |
| `mem_st_cd` | `text` | Y | active/inactive/pending/left/banned |
| `join_dt` | `date` | N | 가입일 |
| `leave_dt` | `date` | N | 탈퇴일 |
| `vers` | `int` | Y | 기본값 1 |
| `del_yn` | `boolean` | Y | 기본값 false |
| `crt_at` | `timestamptz` | Y | 기본값 now() |
| `upd_at` | `timestamptz` | Y | 기본값 now() |

핵심 제약:
- `uk_team_mem_rel_team_mem` (`team_id`, `mem_id`, `vers`)
- 팀당 owner 최소 1명 유지 규칙은 트랜잭션/서비스 레이어에서 보장

## 3) 컬럼 필요유무 판단 기준
- 전역 고유값(이메일, OAuth ID)은 `mem_mst`에 둔다.
- 회원당 선택적·1:1 부가 프로필(UTMB 등)은 **`mem_mst`에 넣지 않고** `mem_utmb_prf` 같은 확장 테이블에 둔다.
- 팀별로 달라질 수 있는 값(권한, 가입상태, 가입/탈퇴일)은 `team_mem_rel`에 둔다.
- 기록/운영 데이터는 팀 격리를 위해 `team_id`를 반드시 포함한다.

### 3.1 팀별 프로필 차등이 필요할 때
- 현재 v2 범위에서는 별도 테이블을 도입하지 않는다.
- 추후 팀별 차등 정보 요구가 생기면, 전역 원본을 유지한 채 팀별 오버라이드 테이블을 추가 검토한다.

## 4) 관계/조회 모델
- 개인 프로필 조회: `mem_mst`
- UTMB 등 확장: `mem_utmb_prf` (`mem_id`, `vers = 0`, `del_yn = false`)
- 로그인 팀 컨텍스트 조회: `team_mem_rel` + `team_mst`
- 내 소속 팀 목록: `team_mem_rel` 기준
- 팀 관리자 목록: `team_mem_rel.team_role_cd in ('owner', 'admin')`

## 5) RLS 원칙 (초안)

이 절은 **제품 권한·노출이 어떻게 되어야 하는지(의미)** 만 정의한다. **실제 `ENABLE ROW LEVEL SECURITY`·`CREATE POLICY`·헬퍼 함수 SQL** 은 `supabase/migrations/` 에 있으며, 운영(prd)에 적용할 **파일 전체·이름 순**은 `database-schema-v2-rollout-progress.md` **§2.1** 이 정본이다.  
롤아웃/컷오버 문서에 마이그레이션 파일명이 많이 보이는 이유는 **적용 순서·운영 절차**를 적어 두기 위함이고, **권한 의미가 `member-domain` 과 별개로 새로 정의된 것은 아니다**(구현이 보강·수정된 것).

- `mem_mst`
  - SELECT/UPDATE: 본인 OAuth 연동 기준(`oauth_kakao_id` / `oauth_google_id` = `auth.uid()`)으로 허용 — 구현: `20260406120000_mem_mst_rls_oauth_and_teammates.sql`
  - SELECT: 동일 팀(정본 `team_mem_rel`) 소속끼리 프로필 조회 허용 — 구현상 `mem_mst_select_same_team` + `team_mem_rel` 조인; **팀 관계 정책과 연계**됨
  - DELETE: 원칙적 금지(soft delete)
- `mem_utmb_prf`
  - SELECT: 레거시와 동등하게 **공개 조회**(`del_yn = false`) — 기록/랭킹 UI 호환
  - INSERT/UPDATE/DELETE: 본인 행 기준(운영 데이터의 `mem_id` 체계와 OAuth 매칭 규칙을 함께 고려해 정책 유지·보강)
- `team_mem_rel`
  - SELECT: 같은 팀 멤버는 조회 가능
  - INSERT/UPDATE: 팀 관리자(`owner`, `admin`)만 허용
  - 본인 탈퇴 시 제한된 self-update 허용
  - 공개 홈 지표(활동/전체 멤버 수)는 원본 행 직접 조회 대신
    `get_public_team_member_stats(p_team_id uuid)` RPC로 제공
  - **구현 유의(PostgreSQL):** 위 “같은 팀이면 SELECT”를 정책 본문에서 `EXISTS (SELECT … FROM team_mem_rel …)` 로만 풀면, 내부 스캔에도 동일 SELECT 정책이 붙어 **42P17 infinite recursion** 이 난다. **의미는 그대로 두고** 소속 검증만 `SECURITY DEFINER` + `SET row_security = off` 헬퍼로 옮긴 것이 `20260407120000_v2_team_mem_rel_rls_no_recursion.sql` 이다(초기 DDL: `20260404081732_v2_wave2_member_team.sql`).
- `team_mst`
  - SELECT: 팀 멤버만
  - UPDATE: 팀 관리자만

## 6) 마이그레이션 매핑 참조
- 상세 컬럼 매핑/변환 규칙은 `database-schema-v2-migration-map.md`를 기준으로 한다.
- 본 문서는 회원 도메인 설계(목적/관계/규약) 정의에 집중한다.

## 7) 오픈 이슈
- 팀 선택 컨텍스트를 JWT claim으로 처리할지, 앱 세션 상태로 처리할지 확정 필요
- **앱 팀 컨텍스트 (현재):** 요청 **Host**(`x-forwarded-host` / `host`)에서 `team_cd`를 해석하고 `team_mst` 정본으로 `team_id`를 조회한다. 진입점은 `lib/queries/request-team.ts`의 `getRequestTeamContext()`(서버 컴포넌트·서버 액션)와 `resolveTeamContextFromHost(host)`(OAuth `route.ts` 등 `headers()` 미사용 경로). `team_mst` 매칭 실패·localhost 등에서는 `lib/constants/gigang-team.ts`의 **`DEFAULT_FALLBACK_TEAM_ID`**(`team_cd = gigang` 정본 UUID)로 폴백한다. 업무 코드에서 이 UUID를 직접 쓰지 않는다.
- **추후:** 한 사용자가 **여러 팀**에 소속되거나 URL이 아닌 **UI로 팀을 전환**하는 경우, 활성 `team_id`를 세션·쿠키·라우트 등으로 정하고 `getRequestTeamContext`를 그에 맞게 확장한다(`database-schema-v2-app-migration-plan.md` §7과 동기).
- 전역 회원 상태를 별도로 둘지(예: 플랫폼 제재용), 현재처럼 팀 상태만으로 운영할지 추후 확정 필요

## 8) 상태 코드 기준 (v2)
`team_mem_rel.mem_st_cd`는 아래 코드만 사용한다.

| 코드 | 의미 |
|------|------|
| `active` | 정상 활동 |
| `inactive` | 일시 비활성(휴면/활동중지) |
| `pending` | 가입 승인 대기 |
| `left` | 자진 탈퇴 |
| `banned` | 운영자 제재 |

비고:
- `mem_st_cd`는 공통코드(`cmm_cd_mst`)로 관리하는 것을 기본으로 한다.
- 성별(`gdr_enm`)은 현재 enum 유지 원칙을 따른다.
