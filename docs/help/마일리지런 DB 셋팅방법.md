# 마일리지런 DB 셋팅방법

마일리지런 기능을 사용하려면 DB에 테이블, 트리거, 시드 데이터가 필요합니다.

## 전제 조건

- Supabase MCP가 연결되어 있어야 합니다 (`/mcp` 명령어로 연결)
- 또는 로컬 Supabase Docker가 실행 중이어야 합니다 (`supabase start`)

## 적용 순서

### 1단계: 테이블 생성

`supabase/migrations/20260327000000_mileage_run.sql` 파일의 SQL을 실행합니다.

이 파일은 다음 테이블과 RLS 정책을 생성합니다:
- `project` — 프로젝트 정보
- `project_participation` — 참여 정보
- `mileage_goal` — 월별 목표
- `activity_log` — 운동 기록
- `event_multiplier` — 이벤트 배율
- `activity_log_event` — 기록-이벤트 연결 (다대다)

**Supabase MCP 사용 시:**
```
mcp__supabase-gigang-dev__apply_migration 또는 execute_sql로 해당 파일 내용 실행
```

**로컬 Docker 사용 시:**
```bash
supabase db reset
# 또는
docker exec -i supabase_db_<project_ref> psql -U postgres < supabase/migrations/20260327000000_mileage_run.sql
```

### 2단계: 트리거 생성

`supabase/migrations/20260328000000_sync_next_month_goal_trigger.sql` 파일의 SQL을 실행합니다.

이 트리거는 `activity_log`에 INSERT/UPDATE/DELETE 발생 시 다음 달~종료월까지 목표를 자동 갱신합니다.

**실행 방법은 1단계와 동일합니다.**

### 3단계: 시드 데이터 (선택)

`supabase/seed.sql` 파일 끝부분에 마일리지런 시드 데이터가 있습니다.
`-- 마일리지런 시드 데이터` 주석 이후 부분만 실행하면 됩니다.

시드 데이터 포함 내용:
- 프로젝트 1개 (마일리지런 시즌4, 5~9월)
- 참여자 13명 (member.full_name 기준 매핑)
- 월별 목표 (5~6월)
- 이벤트 배율 1개 (비온다 ×1.2, 5월)
- 활동 기록 57건 (5월)

**주의:** 시드 데이터는 `member` 테이블에 해당 이름의 회원이 존재해야 합니다. `member.full_name`으로 매핑하므로 member_id가 달라도 동작합니다.

**주의:** 활동 기록 삽입 시 트리거를 비활성화한 후 삽입하고, 다시 활성화합니다. seed.sql에 이미 `DISABLE/ENABLE TRIGGER` 구문이 포함되어 있으므로 그대로 실행하면 됩니다.

## 로컬 환경 (Docker) 한 번에 셋팅

```bash
supabase db reset
```

이 명령어 하나로 마이그레이션 + 시드가 모두 적용됩니다.

## 원격 환경 (Supabase MCP)

Supabase MCP의 `execute_sql` 도구로 각 파일의 SQL을 순서대로 실행하면 됩니다:

1. `supabase/migrations/20260327000000_mileage_run.sql` 실행
2. `supabase/migrations/20260328000000_sync_next_month_goal_trigger.sql` 실행
3. (선택) `supabase/seed.sql`의 마일리지런 부분 실행

## 확인 방법

테이블이 정상 생성되었는지 확인:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('project', 'project_participation', 'mileage_goal', 'activity_log', 'event_multiplier', 'activity_log_event');
```

6개 테이블이 모두 나오면 성공입니다.

트리거 확인:

```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_next_month_goal';
```
