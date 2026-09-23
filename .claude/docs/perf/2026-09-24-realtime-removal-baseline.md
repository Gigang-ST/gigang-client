# Realtime 제거 전/후 측정 (2026-09-24)

`#554`(알림 Realtime 제거) + `#556`(접속자 레이어 중단)을 prd에 올리기 **직전**에 뜬 기준선.
내일 같은 시각에 같은 쿼리를 돌려 대조한다.

> ⚠️ **로그는 24시간만 보관된다.** 아래 "before"는 2026-09-24 03:00 KST 시점에 뜬 것이고,
> 그 뒤에는 다시 못 뽑는다. `pg_stat_statements`도 업그레이드(01:57 KST)로 리셋됐으므로
> **누적 통계의 before는 이 문서가 유일한 기록이다.**

---

## Before — prd, 2026-09-24 03:00 KST

### 원인 사슬이 숫자로 닫힌다

```
테넌트 기동 37회 + 청소부 18회 = 55회
  × 파티션 5개(어제·오늘·앞으로 3일)
  = 275 ALTER/일        ← pg_stat_statements 실측 272/일과 일치
```

Realtime 파티션 정비는 **클라이언트 접속에 반응한다**(공식 문서). 전역 접속자 레이어가
비로그인 포함 모든 방문자에게 채널을 열게 하므로 테넌트가 잠들었다 깨기를 반복한다.

### realtime_logs (24h)

| | 값 |
|---|---:|
| 테넌트 종료(= 그만큼 기동) | **37** |
| 청소부 실행 | **18** |
| 전체 | 557 |

### postgrest_logs (24h)

| | 값 |
|---|---:|
| `Received a schema cache reload message` (NOTIFY) | **195** |
| `Schema cache loaded` | **196** |
| `Connection Pool initialized` (계획 소멸) | **103** |
| **`PGRST002`** | **336** ← 전부 09-23 08시 KST 한 시간. 84분 장애 |
| `Warp server error: Thread killed by timeout manager` | 1,153 |
| 전체 | 3,093 |

### pg_stat_statements (업그레이드 리셋 전, 5.17일 평균)

| | 값 |
|---|---:|
| `ALTER TABLE realtime.messages_*` | **272회/일** |
| `CREATE TABLE IF NOT EXISTS realtime.messages_*` | 272회/일 |
| 재적재 1회 비용 | **약 940ms** (그중 77%가 `pg_timezone_names` 725ms) |
| 재적재 총량 | **136초/일 = DB 실행시간의 6.4%** |
| Realtime WAL 폴링 | 80,754회/일 · 3,141초 · **28.9%** |

### 환경

| | prd | dev |
|---|---|---|
| PostgREST | **14.5** | **14.5** (14.15가 잠깐 떴다 되돌아감) |
| Postgres | 17.6.1.164 | — |
| `authenticator` statement_timeout | **20s** (기본 8s에서 올림) | 20s |

---

## After — dev 선행 확인 (2026-09-24 02:54 KST, 배포 직후)

| | |
|---|---|
| postgres_changes 구독 | **0** |
| WAL 폴링 30초 증가 | **0** |
| 복제 슬롯 | **0개** — `messages` 슬롯까지 사라짐 |
| realtime_logs | `Tenant ... has been terminated: :shutdown` (17:26 UTC) |
| 새 연결 | 17:01 UTC 이후 **0건** |

채널을 여는 경로 둘 다 막혔다 — `PRESENCE_ENABLED = false`(접속자),
`SHOW_MESSAGE_PLANES = false`(종이비행기).

---

## 내일 돌릴 쿼리

### ① 파티션 정비 — 이게 핵심 지표

```sql
select coalesce(sum(calls),0) as alter_calls,
       coalesce(sum(calls),0) / nullif(
         (select extract(epoch from (now()-stats_reset))/86400 from pg_stat_statements_info), 0) as per_day
from pg_stat_statements
where query ilike 'ALTER TABLE realtime.messages_%';
```

**기대: 272회/일 → 0에 가까움.** 접속이 없으면 청소부도 건너뛴다.

### ② 재적재 — ①의 결과

```sql
select calls, round(total_exec_time::numeric/1000,1) as total_s,
       round(mean_exec_time::numeric,1) as mean_ms
from pg_stat_statements where query ilike '%pg_timezone_names%';
```

**기대: 129회/일 → 0에 가까움.**

### ③ 로그 (24h)

```sql
-- Supabase Logs → postgrest_logs
select countIf(event_message like 'Received a schema cache reload%') as notify,
       countIf(event_message like 'Schema cache loaded%') as reload_ok,
       countIf(event_message like 'Connection Pool initialized%') as pool_init,
       countIf(event_message like '%PGRST002%') as pgrst002,
       count(*) as total
from logs where source = 'postgrest_logs';

-- realtime_logs
select countIf(event_message like 'Janitor starting%') as janitor_runs,
       countIf(event_message like '%has been terminated%') as tenant_terminated,
       count(*) as total
from logs where source = 'realtime_logs';
```

**기대: 테넌트 기동 37 → 0, NOTIFY 195 → 청소부 몫만.**

### ④ 앱 쿼리가 실제로 빨라졌나

```sql
select coalesce((regexp_match(query,'"public"\."([a-z0-9_]+)"'))[1], left(query,30)) as rpc,
       calls, round(min_exec_time::numeric,2) as min_ms,
       round(mean_exec_time::numeric,1) as mean_ms,
       round(stddev_exec_time::numeric,1) as stddev_ms
from pg_stat_statements
where query like '%"public"."get_%'
order by total_exec_time desc limit 8;
```

**`mean/min` 부풀림**을 본다. 9/18 문서 §2-5의 교훈대로 **비중(%)이 아니라 부풀림과 절대량**으로
판단한다. 부풀림이 안 줄면 원인은 여전히 스왑이고, 그건 RAM 상향으로만 잡힌다.

---

## 판정 기준

| 결과 | 해석 | 다음 |
|---|---|---|
| ALTER가 0에 가까움 | 가설 확정 — 접속이 정비를 부른다 | 접속자 기능을 되살리려면 `postgres#2464` 필요 |
| ALTER가 90 근처 | 청소부 몫만 남음(18회 × 5) | 그것도 이득. 유지 |
| ALTER가 그대로 272 | **분석이 틀렸다** | 다른 유발원을 찾아야 함 |
| RPC 부풀림이 안 줄음 | 예상대로 — 느림의 주원인은 스왑 | RAM 상향 판단 |

## 되살릴 조건 (`PRESENCE_ENABLED = true`)

1. [supabase/postgres#2464](https://github.com/supabase/postgres/pull/2464) 반영 — 재적재 자체가 사라짐
2. PostgREST 16+ — 재적재 비용 80%↓ ([#5100](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md)). **14.x엔 백포트 없음**
3. RAM 상향 — 재적재가 빨라져 문턱에 안 닿음
