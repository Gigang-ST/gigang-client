# DB 락(Lock) 관리 — 이론부터 우리 프로젝트 적용까지

> 작성 계기: 2026-06-29 운영계(prd) 로그인 무한로딩 사건. 동시 접속이 2~5명에 불과했는데도
> 일부 사용자가 로그인 시 무한로딩을 겪음. 조사 결과 "트래픽 폭주"가 아니라 **락 경합 +
> 위험한 타임아웃 설정**이 원인이었다. 이 문서는 그 사건을 출발점으로 **락이 무엇이고,
> 대용량 서비스가 락을 어떻게 다루며, 기강은 무엇을 적용할지**를 정리한다.
>
> 상태: 📚 학습/설계 문서 (적용 전). 실제 적용은 §6 체크리스트로 추적.

---

## 0. TL;DR (3줄 요약)

1. **락 경합은 사용자 수와 무관하다.** 트랜잭션 하나가 락을 오래 쥐면, `lock_timeout=0`(무제한 대기)
   설정 때문에 뒤따르는 모든 쿼리가 최대 `statement_timeout`(=120초)까지 줄줄이 막혀 전체가 마비된다.
2. 실무의 핵심 원칙은 단순하다: **트랜잭션은 짧게, 타임아웃은 명시해서 빨리 실패(fail-fast),
   DDL은 격리, 쓰기 팬아웃은 제한, 그리고 막힌 순간을 볼 수 있게(관측성).**
3. 우리는 **① 안전 타임아웃 → ② 마이그레이션 규율 → ③ 재계산 팬아웃 완화 → ④ 관측성 →
   ⑤ 스케일 위생** 순서로 적용한다. (§6)

---

## 1. 사건 요약 (왜 이 문서가 필요한가)

2026-06-29 KST 12:12~12:19(03:12~03:19 UTC) 운영계 로그 분석 결과:

| 계층 | 관측된 현상 | 출처 |
|------|------------|------|
| Postgres | `process … still waiting for ShareLock on transaction 19175 after 1000ms` → 1288ms 후 획득 | postgres 로그 |
| Postgres | `canceling statement due to statement timeout` ×2 (쿼리가 120초 채우고 강제 취소) | postgres 로그 |
| Auth(GoTrue) | `POST /token` 8~10초, `GET /user` 최대 11.5초 + **504** (`unable to fetch records: context deadline exceeded`) | auth 로그 |
| 사용자 | 로그인 화면 무한 스피너 | 제보 |

**인과 사슬**

```
누군가의 트랜잭션이 락을 쥠 (정체는 로그 만료로 특정 불가)
        ↓  lock_timeout=0 → 기다리는 쿼리가 안 죽음
다른 쿼리들이 락 뒤에 줄줄이 대기 (최대 120초)
        ↓  커넥션 풀(60) 잠식
Auth(GoTrue)도 같은 DB를 못 읽어 504
        ↓
로그인 무한로딩
```

> ⚠️ **이번 범인 트랜잭션 자체는 못 잡았다.** Supabase `auth.audit_log_entries`가 비어 있었고
> (보관 0건), 서비스 로그는 24시간/100줄 한계라 03:12 시점의 원본 쿼리가 만료됐다. → §5.4 관측성 과제로 이어짐.

**중요한 발견**: 앱 쿼리 자체는 전부 빠르다(`pg_stat_statements` 기준 mean < 100ms). 즉
**"느린 코드"가 아니라 "락 + 설정" 문제**다. 그래서 2~5명에도 터졌다.

---

## 2. 락 이론 기초

### 2.1 왜 락이 필요한가

여러 트랜잭션이 같은 데이터를 동시에 건드리면 **정합성**이 깨진다(이중 가산, 분실 갱신, 유령 읽기).
DB는 락으로 "이 데이터는 지금 내가 쓰는 중"을 표시해 충돌을 직렬화한다. 락은 버그가 아니라
**정합성을 지키는 정상 메커니즘**이다. 문제는 "락을 얼마나 오래/넓게 잡느냐"다.

### 2.2 Postgres의 MVCC와 락의 관계

Postgres는 MVCC(다중 버전 동시성 제어)라서 **읽기는 쓰기를 막지 않고, 쓰기는 읽기를 막지 않는다.**
`SELECT`는 보통 락을 거의 신경 쓸 필요가 없다(스냅샷을 읽음). **락 경합은 주로 쓰기끼리, 또는 DDL에서** 발생한다.

→ 그래서 "로그인(읽기 위주)"이 막혔다는 건, 그 뒤에 **쓰기 또는 DDL이 락을 쥐고 있었다**는 강한 신호다.

### 2.3 락의 종류 (실무에서 마주치는 것만)

| 종류 | 언제 | 강도/범위 | 우리 코드 예 |
|------|------|----------|-------------|
| **Row-level (FOR UPDATE / UPDATE·DELETE)** | 같은 행을 동시 수정 | 그 행만 | `fee_mem_bal_snap` vers 밀기 UPDATE |
| **FK ShareLock** | 자식 INSERT가 부모 행을 참조 검증 | 부모 행 | `mem_ttl_rel` INSERT → `ttl_mst` 참조 |
| **Advisory lock** | 앱이 명시적으로 거는 논리적 락 | 사용자 정의 키 | `recalc_member_balance`의 `pg_advisory_xact_lock` |
| **AccessExclusive (DDL)** | `ALTER TABLE`, `DROP`, 일부 인덱스 | **테이블 전체 (읽기까지 차단)** | 마이그레이션 `ALTER TABLE noti_mst …` |

> `ShareLock on transaction X`(로그에 찍힌 그것)은 "트랜잭션 X가 끝나길 기다린다"는 뜻이다.
> 보통 **같은 키를 INSERT하려는데 앞 트랜잭션이 아직 커밋 안 한 경우**나 **FK 참조 검증**에서 발생한다.

### 2.4 ⭐ 3가지 타임아웃 — 가장 자주 혼동하는 부분

```
쿼리 한 번의 생애 = ① 락 획득 대기 ──→ ② 실제 실행 ──→ (커밋까지 트랜잭션 유지)
                       ↑                    ↑                        ↑
                  lock_timeout      statement_timeout    idle_in_transaction_session_timeout
```

| 설정 | 무엇을 자르나 | 비유 |
|------|--------------|------|
| `lock_timeout` | **락을 기다리는 시간**만. 실행 시간은 안 건드림 | 화장실 문 앞에서 N초 기다려도 안 열리면 **포기하고 돌아감** |
| `statement_timeout` | **쿼리 실행 전체 시간** (대기+실행 합쳐 너무 길면 취소) | 한 번 들어간 사람이 N초 넘으면 강제로 끌어냄 |
| `idle_in_transaction_session_timeout` | **트랜잭션을 열어둔 채 아무것도 안 하는 시간** | 칸 안에서 폰만 보며 방치하는 사람 강제 퇴장 |

**핵심 오해 정정**:
- `lock_timeout`은 "잡고 있는 놈"을 끊는 게 아니라 **"기다리는 내 쿼리"를 포기시키는 것**이다.
- `lock_timeout=3s`는 "쿼리가 3초 안에 끝나야 한다"가 **아니다.** 10초짜리 무거운 쿼리라도
  락 대기 없이 실행되면 영향 없다. 정상 락 대기는 **밀리초**라서, 3초를 기다린다는 건
  이미 비정상 상황 → 빨리 포기시키는 게 맞다. **그래서 3초는 짧은 게 아니라 넉넉한 편이다.**

### 2.5 데드락 vs 단순 락 대기

- **단순 대기**: A가 쥔 걸 B가 기다림. A가 끝나면 B 진행. (느릴 뿐 언젠가 풀림)
- **데드락**: A는 B가 쥔 걸, B는 A가 쥔 걸 서로 기다림 → 영원히 안 풀림.

**Postgres가 자동으로 감지·해소한다(설정 불필요).**
`deadlock_timeout`(우리: 1초)마다 순환 대기를 검사해, 발견하면 **한쪽을 자동 희생(에러+롤백)**시켜
교착을 푼다. 즉 데드락은 무한정 멈추지 않고 **1초 안에 자동으로 풀린다.** lock/statement 타임아웃과 무관하게 항상 동작.

**데드락이 났는지 어떻게 아나**
- postgres 로그에서 `deadlock detected`(에러코드 `40P01`) 검색. DETAIL에 어떤 두 트랜잭션이
  무슨 락을 두고 엇갈렸는지 다 찍힌다 → 원인 추적 가능. (Supabase는 `get_logs(postgres)`로 조회)
- 앱에는 `40P01` 에러로 올라온다 → **잡아서 재시도하면 사용자는 모르게 흡수**.

**예방의 정석**: **항상 같은 순서로 락을 잡기.**
예) 여러 멤버를 갱신할 땐 항상 `mem_id` 오름차순으로. (A는 1→2, B는 2→1 순이면 엇갈려 데드락;
둘 다 1→2면 안 엇갈림.) 트랜잭션을 짧게 해 잡는 락 수·시간을 줄이는 것도 예방이다.
우리 `recalc_member_balance`의 advisory lock(같은 멤버 직렬화)도 이런 충돌을 줄이는 장치다.

---

## 3. 대용량 서비스의 락 관리 원칙 (이론 → 실무 패턴)

대규모 트래픽 기업(결제·커머스·SNS)이 공통으로 지키는 원칙들. 화려한 기술보다 **규율**이 핵심이다.

### 3.1 트랜잭션은 짧고 좁게 (가장 중요)

- 트랜잭션 안에서 **외부 호출(HTTP, 파일, 느린 계산) 금지.** 락을 쥔 채 네트워크를 기다리면 그 시간만큼 전원이 막힌다.
- "읽고 → 생각하고 → 쓰기"를 한 트랜잭션에 묶지 말 것. 계산은 트랜잭션 밖에서, 쓰기만 짧게 묶는다.
- 트랜잭션 열기 직전까지 필요한 데이터를 다 모으고, 열면 **쓰기만 하고 즉시 커밋**.

### 3.2 타임아웃을 반드시 명시 (fail-fast)

- 무제한 대기는 **장애를 전파**시킨다. 락 대기·실행·유휴 모두 상한을 둔다.
- 원칙: `lock_timeout < statement_timeout < (클라이언트/게이트웨이 타임아웃)`.
  그래야 "막히면 작은 에러 하나"로 끝나고, "전체 동반 마비"가 안 된다.
- 실패는 **재시도(backoff)**로 흡수. 사용자에겐 "잠시 후 다시" 한 번이 무한로딩보다 백배 낫다.

### 3.3 DDL/마이그레이션 격리 (운영 중 스키마 변경의 함정)

`ALTER TABLE`은 **AccessExclusive 락**(읽기까지 차단)을 잡는다. 운영 중 핫테이블에 그냥 걸면 그 테이블 전체가 멈춘다.
실무 표준 패턴:

- **마이그레이션 첫 줄에 `SET lock_timeout='3s'`** → 락 못 잡으면 **빨리 실패하고 재시도**(테이블을 인질로 안 잡음).
- **인덱스는 `CREATE INDEX CONCURRENTLY`** (테이블 쓰기 막지 않음).
- **Expand–Contract(확장–수축) 패턴**: 컬럼 타입 변경·NOT NULL 추가 등 위험 작업을 여러 단계로 쪼갬.
  - 예: NOT NULL 추가 = ① nullable로 컬럼 추가 → ② 백필 → ③ `CHECK ... NOT VALID` → ④ 한가할 때 `VALIDATE`.
- **거대 백필은 배치로 쪼개기**(한 트랜잭션에 수만 행 UPDATE 금지 — 락·WAL 폭증).
- **비피크 시간대 배포.**

### 3.4 커넥션 풀링 (특히 서버리스)

- 서버리스(Vercel)는 요청마다 함수 인스턴스가 떠서 **커넥션 폭증** 위험. `max_connections`가 작으면(우리: 60) 금방 포화.
- **PgBouncer(트랜잭션 모드)** 같은 풀러를 반드시 경유. Supabase는 풀러 포트(6543) 제공.
- 느린 쿼리 하나가 커넥션을 오래 점유하면 "기다리는 좀비"가 풀을 잠식 → §3.2 타임아웃이 이걸 막아준다.

### 3.5 쓰기 팬아웃 제어 (배치 작업)

- "전체 멤버 재계산" 같은 대량 쓰기는 **동시성 제한 + 청크 + 백그라운드/큐**로.
- 한 번에 수십 개 동시 트랜잭션을 띄우면 작은 풀을 잠그고 락 경합을 유발. **순차 또는 낮은 동시성(예: 2~4)**으로.
- 사용자 요청(웹 클릭) 경로에서 대량 배치를 동기로 돌리지 말 것 → 잡 큐로 분리.

### 3.6 낙관적 동시성(Optimistic) — 락을 "안 잡는" 전략

- 비관적 락(FOR UPDATE)으로 막는 대신, **버전 컬럼**으로 "내가 읽은 뒤 누가 바꿨나" 확인 후 충돌 시 재시도.
  `UPDATE … WHERE id=? AND version=?` → 영향 0행이면 충돌 → 재시도.
- 경합이 드문 곳에선 락보다 처리량이 높다. (경합이 잦으면 오히려 재시도 폭증 → 비관적 락이 나음)

### 3.7 핫로우(hot row) 회피

- 모두가 같은 한 행을 갱신하면(전역 카운터, 팀 단위 집계) 그 행이 병목.
- 해법: **샤딩된 카운터**(N개 행에 분산 후 합산), **append-only + 집계 뷰**, 또는 비동기 집계.

### 3.8 읽기 복제본 분리

- 무거운 읽기(리포트·랭킹·통계)는 **읽기 복제본**으로 보내 주(write) DB의 락/부하와 격리.

### 3.9 관측성 (막힌 순간을 볼 수 있어야 한다)

- `log_lock_waits=on`(우리 켜져 있음), `log_min_duration_statement`로 느린 쿼리 로깅.
- **blocking 쿼리 실시간 조회**(`pg_locks` + `pg_stat_activity`, §7 부록).
- 장기 보존 로그/알림. 이번처럼 "범인은 로그 만료로 못 잡음"이 재발하지 않게.

---

## 4. 우리 프로젝트 진단 (현황 + 증거)

### 4.1 현재 위험 설정 (운영계 pg_settings 조회 결과)

| 설정 | 현재값 | 평가 | 권장 방향 |
|------|--------|------|----------|
| `lock_timeout` | **0 (무제한)** 🚨 | 락 대기가 안 죽어 연쇄 마비의 핵심 원인 | 앱 역할 3s |
| `idle_in_transaction_session_timeout` | **0 (무제한)** 🚨 | 방치된 트랜잭션이 락 영구 보유 가능 | 10~30s |
| `statement_timeout` | 120000ms (120s) | 너무 김. 막힌 쿼리가 2분 버팀 | 앱 역할 10~15s |
| `max_connections` | 60 | 작음. 풀러 경유 필수 | 풀러 확인 + 필요시 상향 |
| `deadlock_timeout` | 1000ms | 기본값, 적절 | 유지 |

> ⚠️ 위 값은 우리(서비스롤) 세션 기준. **역할별 오버라이드**가 따로 있을 수 있으니
> 적용 전 `pg_roles.rolconfig`로 `authenticated`/`anon`/`authenticator` 실제값을 확인할 것(§7).

### 4.2 락을 유발할 수 있는 핫스팟

1. **마이그레이션 DDL** — `pg_stat_statements` 최상위가 전부 DDL.
   `ALTER TABLE noti_mst ADD COLUMN batch_id`가 **평균 87.8초, 최대 119.7초**(2026-06-06 적용).
   `noti_mst`는 로그인·전 페이지에서 읽는 핫테이블 → 운영 중 DDL = 전체 동결. (이번 사건과 직접 연관은 아니나 동일 메커니즘의 증거)
2. **회비 잔액 재계산 팬아웃** — `app/actions/dues/recalculate-balance.ts`.
   인자 없이 호출 시 활성 멤버 전원을 **`CHUNK_SIZE=20` 동시(`Promise.all`)** 처리. 멤버당
   `recalc_member_balance` RPC가 **advisory xact lock + `fee_mem_bal_snap` UPDATE/INSERT + `fee_due_exm_hist` UPDATE**.
   → 20개 동시 쓰기 트랜잭션이 작은 풀을 잠그고 락 경합. (이번 사건엔 미실행 확인됐으나 잠재 폭탄)
   - 참고: 이미 2026-06-28에 동시 호출 정합성 문제로 advisory lock을 추가했음(`20260628104121`) → **알려진 핫스팟**.
3. **`vers` 밀기 패턴** — 새 스냅샷 넣을 때 기존 `vers=0`을 `max(vers)+1`로 UPDATE. 같은 멤버 동시 진입 시 행 락 경합 가능(현재 advisory lock으로 직렬화 중).

### 4.3 스케일 부채 (지금은 아니어도 인원·데이터 늘면 비용↑) — `get_advisors` 결과

- **RLS initplan 재평가(WARN)**: `mem_mst`, `rec_race_hist`, `brd_post_mst` 등 정책이
  `auth.<fn>()`를 **행마다** 재평가 → `(select auth.<fn>())`로 감싸면 한 번만 평가.
- **다중 permissive 정책(WARN)**: 다수 테이블(fee_*, mem_*, comp_* 등)이 같은 role/action에 정책 2개 → 매 쿼리 둘 다 실행.
- **미인덱스 FK(INFO)**: `fee_*`, `rec_race_hist`, `mem_ttl_rel` 등 일부 FK에 커버링 인덱스 없음 → 부모 행 변경/삭제 시 자식 풀스캔.
- **미사용 인덱스(INFO)**: 정리 후보 다수(쓰기 비용만 발생).

---

## 5. 우리는 어떻게 적용하는가 (방향)

> 원칙: **건드리는 양 대비 효과가 큰 것부터.** 코드 대수술 없이 "한 명이 전체를 마비"시키는 구조부터 끊는다.

### 5.1 P0 — 안전 타임아웃 (효과 최대 / 변경 최소)

P0은 **"기다리는 쪽"과 "잡고 있는 쪽"을 둘 다** 자동 처리한다. 세 설정이 각각 다른 놈을 끊는다:

| 막는 대상 | 설정 | 값 | 동작 |
|-----------|------|----|------|
| 락 못 잡고 **기다리며 줄 쌓는 놈** | `lock_timeout` | **3s** | 3초 못 잡으면 기다리는 쪽이 포기 |
| 락 쥐고 **쿼리가 오래 도는 놈** | `statement_timeout` | **10s** | 10초 넘게 실행되면 그 쿼리 강제 취소 |
| 락 쥔 채 **트랜잭션 열고 방치하는 놈** | `idle_in_transaction_session_timeout` | **15s** | 15초 유휴면 그 세션 강제 종료 |

> 즉 "락을 무한정 쥐고 있는 놈"(예전엔 수동으로 `pg_terminate_backend` 하던 그것)은
> `statement_timeout`(실행 중) + `idle_in_transaction_session_timeout`(방치 중)이 **자동으로 끊는다.**
> = 수동 kill의 자동화. 잔여 케이스(대시보드 `postgres` 세션 등)는 §7.2 수동 조치 런북으로.

**값 결정: 전 역할 10초로 통일(A안).** recalc RPC는 멤버당 ms라 10초로 충분하고, 값이 하나라
관리가 단순하다. 진짜 오래 걸리는 관리자 배치만 그 코드에서 국소 예외(`SET LOCAL`)를 둔다.

```sql
-- 앱 트래픽 역할(로그인/일반 사용자)
ALTER ROLE authenticated SET lock_timeout = '3s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE authenticated SET statement_timeout = '10s';
ALTER ROLE anon          SET lock_timeout = '3s';
ALTER ROLE anon          SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE anon          SET statement_timeout = '10s';

-- 관리자 쓰기 경로(createAdminClient = service_role): 회비 재계산·칭호 엔진 등 쓰기가 여기로 돈다.
-- 락을 오래 쥐는 게 주로 이 경로라 반드시 포함.
ALTER ROLE service_role  SET lock_timeout = '3s';
ALTER ROLE service_role  SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE service_role  SET statement_timeout = '10s';
-- 적용은 새 커넥션부터. 풀러 환경에선 재접속 후 반영.
```

- 순서 보장: `lock_timeout(3s) < statement_timeout(10s) < 앱 함수 타임아웃`.
  **우리 Vercel 프로젝트는 Pro(함수 기본 타임아웃 15s)라 10s보다 커서 안전하다** — DB가 10초에
  에러를 돌려주고 함수(15초)가 그걸 받아 처리/재시도할 여유가 있음. 별도 조치 불필요.
  - Pro 근거: `app/(info)/admin/utmb-refresh/page.tsx`가 `export const maxDuration = 300`을 쓰는데
    이는 Hobby 상한(60s)을 초과 → Pro 확정.
  - ⚠️ `maxDuration`은 App Router에서 **라우트 파일별로** `export const maxDuration = N`으로 설정한다
    (`next.config.ts`·`vercel.json` 전역 설정 아님 — `vercel.json`의 `functions`로도 지정 가능하나 현재 미사용).
    DB를 치는 특정 라우트가 15s보다 오래 필요해지면 **그 라우트에 직접** `export const maxDuration`을 올린다.
- ⚠️ DDL을 도는 `postgres`(마이그레이션) 역할엔 이 짧은 `statement_timeout`을 **걸지 말 것**
  (대형 마이그레이션이 죽음). 마이그레이션의 락 안전장치는 §5.2에서 파일 단위로 따로 건다.
- ⚠️ 10초보다 오래 걸리는 정당한 관리자 배치(대량 엑셀 처리 등)는 그 작업만
  `SET LOCAL statement_timeout = '60s'`로 예외 처리하거나 잡으로 쪼갠다(§5.3).
- 검증: 적용 후 `pg_roles.rolconfig` 재확인(§7.1) + 평상시 timeout 에러율 모니터(과도하면 값 상향).

### 5.2 P1 — 마이그레이션 규약 (코드 수정 아님, 작성 습관)

`ALTER TABLE` 등 DDL은 **AccessExclusive 락**(읽기까지 차단)을 잡는다. 운영 중 핫테이블에 그냥 걸면
그 테이블 전체가 멈춘다(실제로 `noti_mst` ALTER가 최대 120초 걸린 적 있음, §4.2). 그래서
**새 마이그레이션을 쓸 때 아래 규약을 항상 지킨다.** 템플릿: [`supabase/migrations/README.md`](../../../supabase/migrations/README.md).

**규약 3줄**

1. **모든 마이그레이션 첫 줄에 `SET lock_timeout = '3s';`**
   → 락 못 잡으면 마이그레이션이 빨리 실패(테이블을 인질로 안 잡음). 실패하면 잠시 후 재실행.
2. **인덱스 추가/삭제는 `CONCURRENTLY`**
   → `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY` (테이블 쓰기를 막지 않음).
   ⚠️ `CONCURRENTLY`는 트랜잭션 안에서 못 돈다 → 그 마이그레이션엔 `lock_timeout` 한 줄과 함께
   다른 DDL을 섞지 말고 인덱스 작업만 단독으로 둔다.
3. **비피크 배포 + 위험 변경 단계화**
   → 사람 많은 시간대 스키마 변경 지양. NOT NULL 추가·타입 변경·대량 백필은 Expand–Contract(§3.3)로 쪼갬.

> 왜 마이그레이션엔 `statement_timeout`을 짧게 안 거나? 대형 백필/인덱스 빌드가 정당하게 오래 걸릴 수 있어서다.
> 마이그레이션은 "락 대기"만 짧게 끊고(=`lock_timeout`), 실행 자체는 끝까지 두는 게 맞다.

### 5.3 P2 — 재계산 팬아웃 완화

- `recalculateBalance` 전체 재계산의 `CHUNK_SIZE`를 낮추거나(20→4 등) 순차화.
- 전체 재계산은 **사용자 클릭 동기 경로에서 분리** → 백그라운드 잡/큐 또는 비피크 스케줄.
- 데드락 예방: 멤버 갱신 순서를 일관되게(예: mem_id 정렬).

### 5.4 P3 — 관측성 (다음엔 범인을 잡는다)

- blocking 쿼리 상시 조회 쿼리(§7)를 운영 런북에 등록.
- 로그 장기 보존/알림 파이프라인 검토(이번엔 audit 0건·로그 24h 한계로 추적 실패).
- `log_min_duration_statement` 적정값 설정 검토.

### 5.5 P4 — 스케일 위생 (인원 늘기 전 정리)

- RLS 정책 `auth.<fn>()` → `(select auth.<fn>())` 래핑.
- 다중 permissive 정책 통합.
- 핫 경로 FK 인덱스 보강 / 미사용 인덱스 정리.

### 5.6 앞으로 코드/액션 작성 시 (타임아웃 친화 규칙)

P0 타임아웃을 깔면 코드도 거기에 맞춰 짜야 한다. 단, **오해 주의**:

- **타임아웃은 "액션 전체"가 아니라 "쿼리 한 개(statement)" 단위로 적용된다.**
  서버 액션 하나가 작은 쿼리 100개로 총 30초 걸려도, **각 쿼리가 10초 미만이면 멀쩡**하다.
  (예외: RPC plpgsql 함수는 함수 전체가 **한 statement** → 함수 본문이 10초 안에 끝나야 함.)
- 그래서 목표는 **"전체를 10초 안에"가 아니라 "쿼리 하나하나를 가볍게, 트랜잭션은 짧게"**.

**실전 규칙**

| 상황 | 지침 |
|------|------|
| 평범한 CRUD | 신경 쓸 것 없음(ms 단위). 타임아웃 근처도 안 감 |
| 무거운 작업 | 거대 쿼리 한 방 대신 **잘게 쪼개** 여러 statement로 |
| 진짜 긴 단일 작업(대형 리포트·일괄 배치) | 그 경로만 `SET LOCAL statement_timeout='60s'` 예외 + 가능하면 백그라운드 잡 |
| 트랜잭션(RPC) | **짧게.** 안에서 외부 호출(HTTP)·무거운 루프 금지. 락은 쓰기 직전에 잡고 바로 커밋 |

> **참고: 정상 쿼리가 10초를 넘는 건 우리 규모에선 거의 불가능하다.**
> 10초+가 나온다면 "데이터가 많아서"가 아니라 대개 **① 인덱스 누락 풀스캔 ② 락 대기 ③ 조인 실수**
> 셋 중 하나 — 즉 **고쳐야 할 신호**다. 타임아웃은 그걸 잡아주는 알람 역할도 한다.
> (단, 양이 적어도 **대량 UPDATE/INSERT 한 statement**는 길어질 수 있으니 백필류는 배치로 쪼갠다.)

---

## 6. 적용 체크리스트 (진행 추적용)

> 적용 시 dev 먼저 → 검증 → prd. 커밋/배포는 사용자 승인 후.

- [ ] **P0-1** `authenticated`/`anon`/`service_role` 역할에 lock/idle/statement 타임아웃 설정 (dev)
- [ ] **P0-2** 역할별 실제값 검증 + 평상시 에러율 관측 (dev)
- [ ] **P0-3** prd 적용
- [x] **P1-1** 마이그레이션 규약 문서화 + 템플릿(`supabase/migrations/README.md`) 작성
- [ ] **P1-2** 다음 마이그레이션부터 규약 적용(첫 줄 lock_timeout / 인덱스 CONCURRENTLY)
- [ ] **P2-1** `recalculateBalance` 동시성 축소/순차화
- [ ] **P2-2** 전체 재계산 백그라운드 분리 검토
- [ ] **P3-1** blocking 조회 쿼리 런북 등록
- [ ] **P3-2** 로그 보존/알림 파이프라인 검토
- [ ] **P4-1** RLS initplan 래핑
- [ ] **P4-2** 다중 정책 통합 / FK 인덱스 보강

---

## 7. 부록

### 7.1 진단 쿼리 모음

**역할별 타임아웃 실제값 확인**
```sql
SELECT rolname, rolconfig
FROM pg_roles
WHERE rolname IN ('authenticated','anon','authenticator','postgres','service_role');
```

**지금 누가 누구를 막고 있나 (blocking tree)**
```sql
SELECT
  blocked.pid        AS blocked_pid,
  blocked.query      AS blocked_query,
  blocking.pid       AS blocking_pid,
  blocking.query     AS blocking_query,
  blocking.state     AS blocking_state,
  now() - blocking.xact_start AS blocking_xact_age
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.wait_event_type = 'Lock';
```

**오래 열려 있는 트랜잭션 (idle in transaction 포함)**
```sql
SELECT pid, state, now() - xact_start AS xact_age, now() - state_change AS since_state, left(query, 120) AS query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start
LIMIT 20;
```

**평균/최대 느린 쿼리 (앱 쿼리 점검)**
```sql
SELECT round(mean_exec_time::numeric,1) AS mean_ms,
       round(max_exec_time::numeric,1)  AS max_ms,
       calls, rows, left(regexp_replace(query,'\s+',' ','g'),160) AS query
FROM pg_stat_statements
WHERE calls > 1
ORDER BY mean_exec_time DESC
LIMIT 25;
```

**현재 락 목록 (관계별)**
```sql
SELECT l.locktype, l.mode, l.granted, c.relname, a.pid, left(a.query,80) AS query
FROM pg_locks l
LEFT JOIN pg_class c ON c.oid = l.relation
LEFT JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.relation IS NOT NULL
ORDER BY l.granted, c.relname;
```

### 7.2 수동 조치 런북 — 락 쥔 놈을 직접 끊을 때

P0 자동 타임아웃이 못 잡는 경우(대시보드에서 직접 돌린 `postgres` 세션, 타임아웃 설정 전 등)나
긴급 상황에서 **수동으로 끊는** 절차. 순서대로.

**① 범인 찾기 — 지금 누가 락을 오래 쥐고 있나**
```sql
SELECT pid, usename, state,
       now() - xact_start  AS xact_age,     -- 트랜잭션 연 지 얼마나 됐나
       now() - query_start AS query_age,    -- 이 쿼리 시작한 지 얼마나
       wait_event_type, left(query, 120) AS query
FROM pg_stat_activity
WHERE state <> 'idle'                       -- 'idle in transaction' 은 포함됨(주의 대상)
  AND pid <> pg_backend_pid()               -- 나 자신 제외
ORDER BY xact_start NULLS LAST
LIMIT 30;
```
→ `xact_age`가 비정상적으로 크거나 `state='idle in transaction'`인 놈이 용의자.
누가 누구를 막는지는 §7.1 blocking tree로 교차 확인.

**② 부드럽게 — 현재 쿼리만 취소 (연결은 유지)**
```sql
SELECT pg_cancel_backend(<pid>);
```
→ 가능하면 이걸 먼저. 트랜잭션의 현재 statement만 취소돼 깔끔하게 롤백된다.

**③ 강하게 — 연결 자체를 강제 종료**
```sql
SELECT pg_terminate_backend(<pid>);
```
→ `pg_cancel_backend`로 안 풀릴 때(예: `idle in transaction`이라 취소할 쿼리가 없을 때). 세션을 끊어 락을 강제 해제.

> ⚠️ 끊는 건 **증상 완화**일 뿐이다. 같은 놈이 또 락을 오래 쥔다면 근본 원인(긴 트랜잭션·외부 호출·대량 쓰기, §3.1/§5.3)을 고쳐야 한다.
> 그리고 P0를 적용하면 ②③을 손으로 할 일이 거의 없어진다(자동 종료).

### 7.3 용어집

| 용어 | 뜻 |
|------|-----|
| MVCC | 다중 버전 동시성 제어. 읽기/쓰기가 서로 안 막히게 버전을 둠 |
| AccessExclusive | 가장 강한 테이블 락. 읽기까지 막음. DDL이 잡음 |
| ShareLock on transaction | 특정 트랜잭션이 끝나길 기다리는 상태(FK·중복 INSERT 등) |
| advisory lock | 앱이 임의 키로 거는 논리적 락. 정합성 직렬화에 사용 |
| fail-fast | 무한 대기 대신 빨리 실패시켜 장애 전파를 막는 전략 |
| Expand–Contract | 스키마 변경을 무중단으로 쪼개는 단계적 패턴 |
| 낙관적 동시성 | 락 대신 버전 비교로 충돌을 감지·재시도 |

### 7.4 참고

- Supabase Database Linter: https://supabase.com/docs/guides/database/database-linter
- Postgres `lock_timeout`/`statement_timeout`/`idle_in_transaction_session_timeout` 문서
- RLS 성능: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
- 관련 사내 문서: `.claude/docs/KNOWLEDGE.md`, `.claude/docs/coding-standards.md`
</content>
</invoke>
