# 2026-09-23 84분 장애 — Realtime → 스키마 캐시 재적재

## 한 줄

**Realtime 때문에 생긴 건 맞는데, Realtime이 느려서가 아니다.**
Realtime이 깨어날 때마다 날리는 **21ms짜리 DDL 한 줄**이 PostgREST의 **감시 트리거를
오작동**시켜, API 서버가 DB 구조를 처음부터 다시 외우게 만들었다. 하루 **196번**.

| 2026-09-23 (KST) | |
|---|---|
| 08:00~ | REST API가 `PGRST002`를 초당 7개씩 반환 시작 |
| 08:43 | Postgres 재시작으로 종료 |
| 합계 | **84분** · `PGRST002` **336건** (나머지 23시간은 **0건**) |

SQL은 멀쩡히 돌았다. **API 계층만 죽었다.**

---

## 0. 등장인물 넷

| | 무엇 |
|---|---|
| **Realtime** | Elixir 서버. 여러 프로젝트가 **공용 클러스터**를 나눠 쓴다 |
| **PostgREST** | 우리 REST API 서버. 앱의 모든 DB 요청이 여기를 지난다 |
| **Postgres** | DB |
| **`pgrst_ddl_watch`** | Postgres에 깔린 **이벤트 트리거**. Supabase 기본 설치 |

---

## 1. Realtime이 하려는 일 — 메시지 보관함 관리

Realtime엔 **Broadcast from Database**라는 기능이 있다. DB에서 `realtime.send()`를 부르면
접속한 클라이언트들에게 메시지가 날아가는 것.

그 메시지가 `realtime.messages`에 쌓이는데, **3일만 보관**하고 버린다.

수백만 행을 `DELETE`로 지우면 느리고 테이블이 부푼다. 그래서 **날짜별로 칸을 나눠** 두고
오래된 칸을 **통째로 `DROP`**한다. 즉시 끝난다.

```
realtime.messages              ← 부모 (껍데기)
├─ messages_2026_09_22        ← 9/22치
├─ messages_2026_09_23        ← 9/23치
└─ messages_2026_09_24        ← 9/24치   ... 오래된 건 DROP
```

## 2. 칸은 미리 만들어야 한다

파티션 테이블은 **행이 들어갈 칸이 없으면 에러**다.

```
ERROR: no partition of relation "messages" found for row
```

그래서 Realtime은 **어제·오늘·앞으로 3일 = 5칸**을 항상 확보해 둔다.

> ⚠️ **우리는 이 기능을 쓰지 않는다.** prd `realtime.messages` 실측 **행 0개** · 파티션 23개 ·
> 280kB. 공 튕기기는 클라이언트끼리 주고받는 broadcast라 DB를 안 거친다.
> 그래도 Realtime은 *"이 프로젝트가 쓸지 안 쓸지 모르니 일단 준비"*로 똑같이 돈다.

---

## 3. 언제 하나 — 깨어날 때와 청소부

| 계기 | prd 실측(하루) |
|---|---:|
| **테넌트 기동** — 아무도 없다가 클라이언트가 처음 접속 | **37회** |
| **청소부(janitor)** — 3~4시간마다, 접속 이력 있는 프로젝트만 | **18회** |
| 합계 | **55회** |

Realtime은 접속자가 없으면 테넌트를 내린다(정상 — 공용 클러스터 자원 관리). 누가 오면
올린다. 우리는 **39분에 한 번꼴**로 그 왕복이 일어났다.

`realtime_logs`의 `Tenant ... has been terminated: :shutdown`이 그 횟수다.

## 4. 실행되는 SQL — 칸마다 두 줄

```sql
CREATE TABLE IF NOT EXISTS realtime.messages_2026_09_22
  PARTITION OF realtime.messages FOR VALUES FROM (...) TO (...);

ALTER TABLE realtime.messages_2026_09_22
  OWNER TO supabase_realtime_admin;
```

**55회 × 5칸 = 275쌍/일** — `pg_stat_statements` 실측 **272회/일**과 일치한다.

### `ALTER`가 왜 필요한가

`CREATE TABLE`로 만들면 그 테이블은 **명령을 실행한 롤 소유**가 된다. 나중에 청소부가
`DROP`하려면 `supabase_realtime_admin`이 주인이어야 하므로, 만든 직후 주인을 넘긴다.

### 그런데 조건이 없다 ← **버그 ①**

```
CREATE TABLE IF NOT EXISTS   ← 이미 있으면 아무것도 안 함 (조용함)
ALTER TABLE ... OWNER TO     ← 조건 없이 매번 실행    (시끄러움)
```

SQL에 `ALTER ... OWNER TO ... IF DIFFERENT` 같은 문법이 **없다.** 확인하려면
`pg_class.relowner`를 먼저 조회해 비교하는 코드를 따로 짜야 한다. 그래서
*"같은 주인으로 ALTER 하는 건 공짜니까 그냥 매번"*으로 간 것으로 보인다.

**그 판단 자체는 틀리지 않았다** — ALTER 1,405번에 **29.3초**, 한 번에 **21ms**다.
Postgres 입장에선 아무것도 아니다. **비용은 전부 부작용에서 나온다.**

---

## 5. 그 ALTER가 경보기를 울린다 ← **전환점**

Postgres엔 `ddl_command_end` 이벤트 트리거가 걸려 있다. **DDL이 끝날 때마다** 실행된다.

```sql
CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger AS $$
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF cmd.command_tag IN ('CREATE TABLE', 'ALTER TABLE', 'CREATE FUNCTION', ...)
       AND cmd.schema_name is distinct from 'pg_temp'    -- ← 임시 테이블만 제외
    THEN
      NOTIFY pgrst, 'reload schema';                     -- ← 여기
    END IF;
  END LOOP;
END; $$
```

`ALTER TABLE`이 목록에 있고, 스키마 필터가 `pg_temp` 하나뿐이다.
**`realtime` 스키마는 안 걸러진다.**

**PostgREST는 `realtime` 스키마를 노출하지도 않는데** 알람이 울린다 ← **버그 ②**

## 6. PostgREST가 받아서 캐시를 통째로 다시 읽는다

PostgREST는 `pgrst` 채널을 `LISTEN` 중이다. NOTIFY를 받으면(100ms 디바운스 후)
**스키마 캐시 전면 재적재**를 한다.

실측: **NOTIFY 195건 → 재적재 196건/일.**

### 재적재가 실제로 하는 일 — 카탈로그 조회 13개

```
Schema cache loaded 52 Relations, 51 Relationships, 71 Functions,
                    0 Domain Representations, 4 Media Type Handlers, 1196 Timezones
```

| 담는 것 | 왜 필요한가 |
|---|---|
| 52 Relations | 노출된 테이블·뷰와 컬럼 |
| 51 Relationships | FK 관계 — `?select=mem_nm,team_mem_rel(intro_txt)` 임베드용 |
| 71 Functions | RPC로 부를 수 있는 함수 |
| **1196 Timezones** | `Prefer: timezone=` 헤더 검증용 |

| 쿼리 | 평균 |
|---|---:|
| **`SELECT name FROM pg_timezone_names`** | **725ms** ← 전체의 **77%** |
| 도메인 base_types 재귀 조회 | 178ms |
| pks_fks · all_relations · role_setting 등 | 합쳐 40ms |
| **합계** | **약 940ms** |

**재적재는 데이터를 다시 읽는 게 아니다.** 구조만 다시 읽는다. 그리고 **우리 구조는
안 바뀌었다** — 바뀐 건 `realtime` 스키마의 파티션 소유자다. 하루 196번이 통째로 헛일이다.

타임존 1,196개는 DB 구조와 **아무 상관 없다.** PostgREST도 과하다고 보고
**16.0에서 빼버렸는데**([#5100](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md))
우리는 **14.5**라 아직 읽는다.

---

## 7. 부하가 걸리는 두 갈래

### ① 직접 — 재적재 쿼리 자체

```
940ms × 196회/일 = 136초/일  =  DB 실행시간의 6.4%
```

### ② 간접 — **이게 더 크다**

PostgREST **14.10 이전**엔 재적재할 때 **커넥션 풀을 통째로 비우는** 버그가 있었다
(#4645). 우리는 **14.5**라 그 버그가 있다.

```
재적재 → 연결 10개 전부 새로 맺음 (하루 103회)
  → 준비된 구문(쿼리 계획)이 연결과 함께 소멸
    → 다음 요청이 계획을 처음부터 다시 세움
```

| | 계획 있을 때 | 계획 다시 세울 때 |
|---|---:|---:|
| `get_public_team_sch_posts` | **0.68ms** | **69ms** (100배) |
| `get_team_story_feed` | 19ms | 164ms (8.6배) |

인덱스로도 SQL로도 못 줄이는 순수 낭비다.

---

## 8. 어떻게 84분 장애가 됐나 — 되먹임 고리

`authenticator` 롤의 `statement_timeout`이 **기본 8초**다.

평소엔 타임존 쿼리가 725ms라 여유가 있다. 그런데 **인스턴스가 상시 스왑 중**이라
(`2026-09-18-performance-audit.md` §1) 같은 쿼리가 **최악 5.9초**까지 간다 — **제한의 74%**.

9/23 아침, 한 번 8초를 넘었다.

```
캐시를 못 만듦
  → 모든 요청에 503 PGRST002
    → 재시도 → 같은 940ms짜리 쿼리 또 실행
      → DB가 더 느려짐
        → 또 타임아웃 → 또 재시도 ...
```

**스스로 굴러간다.** 부하가 저절로 빠지기 전엔 안 끝난다. 그래서 84분이다.

---

## 9. 우리 앱이 기여한 부분 — 방아쇠 빈도

파티션 정비는 **클라이언트 접속에 반응한다**
([공식 문서](https://supabase.com/docs/guides/troubleshooting/realtime-warn-sending-broadcast-message):
*"the first time a client joins a channel for the project"*).

접속자 얼굴 기능이 루트 레이아웃에 있어 **비로그인 포함 모든 방문자**가 채널을 열었다.

### ⚠️ 어중간한 트래픽이 제일 나쁘다

| | 테넌트 | 정비 |
|---|---|---|
| 아무도 안 옴 | 계속 잠 | 없음 |
| **띄엄띄엄 옴** | **재웠다 깨웠다** | **폭발** |
| 계속 붐빔 | 계속 깨어 있음 | 거의 없음 |

**트래픽이 더 많았으면 안 터졌다.** 138명이 알림 받고 들어와 몇 분 보고 나가는 패턴이
정확히 최악이다.

그리고 **2026-09-16 접속자 레이어를 전역으로** 올리면서 깨우는 기회가 두 배가 됐다.
재적재가 **66 → 129회/일**로 올랐고, **5일 뒤 장애가 났다.**

---

## 10. 전체 사슬 한 장

```
사람이 앱에 들어옴 (하루 37번, 아무도 없던 상태에서)
  → Realtime 테넌트 기동
    → 메시지 보관함 5칸 확보        ← 우리는 이 기능을 쓰지도 않음 (행 0개)
      → ALTER TABLE ... OWNER TO × 5   (21ms, 공짜에 가까움)
        → pgrst_ddl_watch 발동          ← realtime 스키마를 안 거름  [버그②]
          → NOTIFY pgrst, 'reload schema'
            → PostgREST 스키마 캐시 전면 재적재 (940ms, 77%가 타임존)
              ├─ 직접 비용: 136초/일 (DB의 6.4%)
              └─ 커넥션 풀 flush → 계획 소멸 → 모든 쿼리 100배   [14.5의 버그]
                → 스왑으로 부풀어 8초 제한 돌파
                  → 무한 재시도 → 84분 장애
```

**어디에도 우리 코드가 없다.** 우리가 한 건 맨 윗줄(방아쇠를 자주 당긴 것) 하나뿐이고,
그래서 지금 막아둔 것도 그 하나다.

### 왜 코드 리뷰로는 못 찾나

앱에 **DDL이 한 줄도 없다.** 마이그레이션 말고는.
머티리얼라이즈드 뷰 0개 · DDL 포함 함수 0개 · pg_cron 미설치.
`pg_stat_statements`와 `postgrest_logs`·`realtime_logs`를 **같이** 봐야 사슬이 보였다.

---

## 조치

| | 무엇 | 효과 |
|---|---|---|
| **#554** | 알림 Realtime 구독 → 이벤트 기반 조회 | WAL 폴링(DB 시간 28.9%) 제거 |
| **#556** | 접속자 레이어 잠정 중단 (`PRESENCE_ENABLED = false`) | 재적재 방아쇠 제거 |
| DB | `alter role authenticator set statement_timeout = '20s'` (기본 8s) | 무한 재시도 차단 |

`#556`은 **상수 한 줄**이다. 삭제가 아니라 잠정 중단이고 아래 코드는 손대지 않았다.

### 달라지는 것

- **탭바 위 접속자 얼굴 · 공 튕기기 · 전광판 `지금 보는 중 N명`이 안 보인다**
- 푸시를 **안 켠** 분(138명 중 112명)은 앱을 보고 있는 동안 알림 배지가 즉시 안 오른다.
  **벨을 누르면 그 자리에서 조회해 정상 표시된다.** 알림이 사라지지는 않는다.
- 푸시를 켠 분은 **체감 동일** — 푸시가 도착하면 서비스워커가 열린 화면에 신호를 보내
  배지가 같이 갱신된다.

## 되돌릴 조건

`PRESENCE_ENABLED = true` 한 글자. 셋 중 **하나**면 된다.

| | 상태 |
|---|---|
| [supabase/postgres#2464](https://github.com/supabase/postgres/pull/2464) — `realtime`·`auth`·`storage` DDL은 NOTIFY 안 함 | **draft · 리뷰 0건** (9/18 개설) |
| PostgREST **16+** — 타임존 캐싱 제거로 재적재 비용 80%↓ | **불가** — Supabase가 14.x 라인, 우리는 14.5. 백포트 없음 |
| Supabase RAM 상향 | 판단 대기 |

관련 신고: [supabase/supabase#50043](https://github.com/supabase/supabase/issues/50043)
(9/5 신고 → 9/14 "활동 없음"으로 닫힘 → 다른 사용자 항의 + 기여자 재오픈 요청)

---

## 아직 안 끝난 것

- **측정** — 기준선은 `2026-09-24-realtime-removal-baseline.md`.
  배포 하루 뒤 `ALTER TABLE realtime.messages_*` 호출 수가
  **272 → 0 근처면 확정**, **272 그대로면 이 분석이 틀린 것**이다.
- **근본 원인은 그대로다.** `2026-09-18-performance-audit.md` §1이 대조군 실험으로 확정해 둔
  **메모리 부족 → 상시 스왑**은 이번 조치로 안 없어진다(빈 프로젝트도 216MB를 스왑한다).
  **"장애가 안 나는 것"과 "빠른 것"은 다른 문제**이고, 이번 조치는 앞쪽만 해결한다.
- **PostgREST가 14.5에 묶여 있는 게 정상인지** — 14.x 최신은 14.18(9/10)이고 그 사이
  `#4645`(§7-②) 등 우리 문제를 정확히 고치는 수정이 들어갔다. 지원 문의 대상.
- **파티션이 23개 남아 있다** — 보관 3일·창 5일이면 5~6개여야 한다. 청소부가 제대로
  안 지우는 것으로 보이나 280kB라 실害가 없어 안 팠다.
- `Warp server error: Thread killed by timeout manager` 하루 1,244건 — 정체 미확정.
  완료 요청 로그(655건)보다 많아 숫자가 안 맞고, Warp에서 유휴 연결 정리 때도 나는 흔한
  로그다. 앱이 정상 동작하는 걸로 봐서 대부분 그쪽으로 보이나 **확정 못 했다.**

## 교훈

**비중(%)으로 우선순위를 매기지 말 것.** 재적재는 DB 시간의 6%로 3위였지만, 느린 게 아니라
**안 되는** 것이라 사용자 영향은 1위였다. (같은 교훈이 `2026-09-18-performance-audit.md`
§2-5에도 있다 — 그때는 반대 방향으로, 30%짜리 Realtime 폴링이 사실 체감에 영향이 없었다.)

**앱 코드에 없는 원인이 있다.** 이번 건은 코드 리뷰로는 영원히 못 찾는다.
