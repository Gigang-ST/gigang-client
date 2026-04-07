# v2 점진 전환 체크리스트

## 1) 사전 준비
- [ ] 적용 대상이 `supabase-gigang-dev`인지 재확인
- [ ] 배포 창구/롤백 담당자/승인자 지정
- [ ] 앱 코드가 v1/v2 동시 읽기 가능한지 확인
- [ ] 데이터 동결 시간대(필요 시) 공지
- [ ] 상세 이관 규칙은 `database-schema-v2-migration-map.md` 기준으로 동결

## 2) 정합성 검증

### 2.1 행 수/키 무결성
- [ ] `member` -> `mem_mst` 1:1 매핑 검증
- [ ] `race_result.member_id`가 모두 `mem_mst.mem_id`로 매핑되는지 검증
- [ ] `competition_registration`가 `comp_reg_rel`로 누락 없이 이관되는지 검증

권장 검증 쿼리 예시:
```sql
select count(*) from public.member;
select count(*) from public.mem_mst where del_yn = false;

select count(*) as orphan_count
from public.race_result rr
left join public.mem_mst p on p.mem_id = rr.member_id
where p.mem_id is null;
```

### 2.2 값 보존 검증
- [ ] 이메일/OAuth ID 유니크 충돌 여부 검증
- [ ] 날짜/시간 컬럼(`joined_at`, `created_at`, `updated_at`) 변환 손실 여부 검증
- [ ] enum -> code 문자열 매핑이 정책과 일치하는지 검증

## 3) 권한/RLS 검증
- [ ] 본인 프로필 조회/수정만 가능한지
- [ ] 같은 팀 멤버 조회 가능/타팀 멤버 조회 불가인지
- [ ] 팀 관리자만 팀 운영 데이터 수정 가능한지
- [ ] 서비스 롤만 가능한 작업이 노출되지 않는지

테스트 시나리오:
- [ ] 단일팀 일반 멤버
- [ ] 다중팀 멤버(팀 A/B)
- [ ] 팀 관리자(owner/admin)
- [ ] 비소속 사용자

## 4) 성능 검증
- [ ] 핵심 쿼리 `explain analyze` 전/후 비교
- [ ] 인덱스 사용 여부 확인(순차 스캔 과다 여부)
- [ ] RLS 적용 후 응답 시간 변화 측정
- [ ] 배치 백필 시간/락 영향 확인

핵심 쿼리 후보:
- [ ] 내 팀 목록 조회
- [ ] 팀별 대회 목록 + 참가자 수
- [ ] 개인 기록 랭킹 조회
- [ ] 월별 회비 납부 현황 조회

## 5) 점진 전환 시나리오

### 단계 A: 병행 구조 준비
- [ ] v2 테이블/인덱스/트리거 생성
- [ ] 백필 1차 수행
- [ ] v2 읽기 전용 검증

### 단계 B: 이중 쓰기(선택)
- [ ] 앱에서 v1+v2 동시 쓰기 적용
- [ ] 누락/지연 모니터링
- [ ] 주기적 diff 검증

### 단계 C: 읽기 전환
- [ ] 일부 화면부터 v2 읽기 전환
- [ ] 에러율/성능/권한 이슈 관찰
- [ ] 문제 없으면 전체 읽기 전환

### 단계 D: 쓰기 전환
- [ ] 쓰기를 v2 단일 경로로 전환
- [ ] v1 쓰기 중단
- [ ] 안정화 기간 운영

### 단계 E: 정리
- [ ] v1 의존 코드 제거
- [ ] 구 테이블 read-only 전환 후 폐기 일정 수립

## 6) 롤백 계획
- [ ] 롤백 트리거 조건 정의(에러율, 데이터 불일치율, 성능 저하 기준)
- [ ] 롤백 순서 문서화(앱 read/write 경로 -> DB 정책/테이블)
- [ ] 롤백 시 데이터 손실 없는지 사전 검증

## 7) 릴리스 완료 기준 (DoD)
- [ ] 정합성 검증 100% 통과
- [ ] 권한 테스트 시나리오 통과
- [ ] 주요 API 성능 기준치 이내
- [ ] 장애 대응/롤백 리허설 완료

## 8) prd(운영) DB 반영 — dev 시행착오 재발 방지

**원칙:** 운영에서는 **dev에서 이미 검증·동결된 마이그레이션 세트와 절차만** 재현한다. 컬럼명·공통코드 값·백필 순서를 prd에서 다시 “맞춰 보기”하지 않는다.

**완성본 정의(히스토리와 구분):** prd에 적용할 DDL·RLS의 **단일 기준**은 `database-schema-v2-rollout-progress.md` **§2.1** — 저장소 `supabase/migrations/*.sql` 전체를 파일명 순으로 적용한 결과다. §5.5·§10 등 연표는 dev 추적용이며, 운영 절차서는 **§2.1 + 본 절(§8)** 이다.

- [ ] 적용 대상이 **`supabase-gigang-prd`**(또는 팀이 지정한 prod)인지 대시보드·연결 문자열로 **이중 확인**
- [ ] **동일 Git 리비전**의 `supabase/migrations/` 전체를 기준으로 적용 순서를 정한다(임의로 통합 백필만 발췌하거나 순서 재배열 금지)
- [ ] **`schema_migrations.version`** 이 로컬 파일 타임스탬프와 일치하는지 확인한다. MCP 등으로 적용 시 버전이 어긋난 전례가 있으므로, prd는 **`supabase db push`** 또는 팀이 합의한 **단일 적용 경로**를 쓴다(수동 `repair`/정렬 절차를 문서에 남긴 뒤에만 예외)
- [ ] 백필은 **P0→… 페이즈별**로 dev와 동일한 파일·순서를 따른다(`database-schema-v2-rollout-progress.md` §5.0a·§5.5)
- [ ] `comp_evt_cfg`는 **`20260407013000` 포함 여부**까지 dev와 동일하게 맞춘 뒤, 그 스키마 기준으로 P4 이후 스크립트·`02309` 조인이 성립하는지 확인한다(컬럼 `comp_evt_type` 자유값 규약은 `migration-map` §2.1)
- [ ] 일회성 함수(`migration_v2_map_*` 등)는 **어느 마이그레이션에서 정의·DROP 되는지** dev 로그와 동일하게 이해한 뒤 실행한다. 페이즈를 나눈 경우 **후속 페이즈에서 필요한 함수가 DROP 뒤에 없어지지 않도록** 순서를 지킨다
- [ ] `mem_mst` ↔ `auth.users` FK 재부착 등 **prd 전용 DDL**은 `scripts/sql/` 등 합의된 경로만 사용한다(`rollout-progress` §5.6)
- [ ] **앱 슬라이스 1(회원 `mem_mst`·`team_mem_rel`) 배포 전:** 아래가 **둘 다** 적용됐는지 확인한다. prd는 **저장소 `supabase/migrations/` 전체를 버전 순으로 적용**하면 자동 포함된다(`rollout-progress` **웨이브 2a**). 일부만 선별 적용하지 말 것.
  - `20260406120000_mem_mst_rls_oauth_and_teammates.sql` — OAuth·본인 행 매칭, 동료 `mem_mst` 조회 정책. 누락 시 프로필/목록이 RLS에 막힐 수 있음.
  - `20260407120000_v2_team_mem_rel_rls_no_recursion.sql` — 웨이브 2 `team_mem_rel` 정책이 `team_mem_rel`를 다시 읽어 **`mem_mst_select_same_team`과 연쇄 시 42P17(infinite recursion)** 이 나는 문제 수정(`SECURITY DEFINER` 헬퍼). **`20260406120000`만 있고 본 파일이 없으면** 로그인·온보딩·동료 조회에서 동일 오류가 남을 수 있음.
- [ ] `20260407123000_v2_public_team_member_stats_rpc_service_role_only.sql` 적용 여부 확인 — `get_public_team_member_stats(uuid)`는 **`service_role`만 EXECUTE** 허용되어야 한다(`anon`/`authenticated` REVOKE). 홈 지표 호출은 서버 admin 클라이언트 경로를 사용한다.
- [ ] 공통코드·`*_cd` 컬럼 대응은 **`migration-map` §2.1 표**만 단일 기준으로 삼는다(컬럼명이 `cd_grp_cd`와 다르더라도 표에 있으면 정상; 표 밖은 설계 변경으로 처리)

### 8.1) 마지막 확인 — dev와 같은 방식으로 마이그레이션했는지

- [ ] **Git이 유일한 정본:** dev에만 실행해 두고 **커밋되지 않은** 마이그레이션 SQL이 없다. prd에 적용한 내용은 **전부** 고정한 Git 리비전의 `supabase/migrations/*.sql` 과 대응한다.
- [ ] **적용 방식 동일:** prd도 dev와 같이 **폴더 내 모든 `*.sql`을 파일명(타임스탬프) 오름차순**으로 적용했고, 선별·순서 변경을 하지 않았다(`rollout-progress` §2.1).
- [ ] **`schema_migrations` 대조:** prd DB의 `schema_migrations.version` 집합이 위 리비전의 마이그레이션 파일명 접두와 **일치**함을 확인했다.
- [ ] **데이터는 다를 수 있음:** dev/prd **데이터(행)** 는 소스가 다르므로 달라도 된다. 검증 대상은 **구조·정책 동등**(마이그레이션 결과)이지 테이블 내용의 동일 복제가 아니다.

실행 후 **§2.1 정합성·`rollout-progress` §5.2 검증 SQL 결과**를 prd에도 남긴다.
