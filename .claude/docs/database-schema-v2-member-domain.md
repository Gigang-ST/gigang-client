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
- 팀별로 달라질 수 있는 값(권한, 가입상태, 가입/탈퇴일)은 `team_mem_rel`에 둔다.
- 기록/운영 데이터는 팀 격리를 위해 `team_id`를 반드시 포함한다.

### 3.1 팀별 프로필 차등이 필요할 때
- 현재 v2 범위에서는 별도 테이블을 도입하지 않는다.
- 추후 팀별 차등 정보 요구가 생기면, 전역 원본을 유지한 채 팀별 오버라이드 테이블을 추가 검토한다.

## 4) 관계/조회 모델
- 개인 프로필 조회: `mem_mst`
- 로그인 팀 컨텍스트 조회: `team_mem_rel` + `team_mst`
- 내 소속 팀 목록: `team_mem_rel` 기준
- 팀 관리자 목록: `team_mem_rel.team_role_cd in ('owner', 'admin')`

## 5) RLS 원칙 (초안)
- `mem_mst`
  - SELECT/UPDATE: 본인 `mem_id = auth.uid()`
  - DELETE: 원칙적 금지(soft delete)
- `team_mem_rel`
  - SELECT: 같은 팀 멤버는 조회 가능
  - INSERT/UPDATE: 팀 관리자(`owner`, `admin`)만 허용
  - 본인 탈퇴 시 제한된 self-update 허용
- `team_mst`
  - SELECT: 팀 멤버만
  - UPDATE: 팀 관리자만

## 6) 마이그레이션 매핑 참조
- 상세 컬럼 매핑/변환 규칙은 `database-schema-v2-migration-map.md`를 기준으로 한다.
- 본 문서는 회원 도메인 설계(목적/관계/규약) 정의에 집중한다.

## 7) 오픈 이슈
- 팀 선택 컨텍스트를 JWT claim으로 처리할지, 앱 세션 상태로 처리할지 확정 필요
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
