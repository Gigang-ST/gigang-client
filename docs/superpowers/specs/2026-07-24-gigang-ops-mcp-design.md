# 기강 운영 MCP — 설계 스펙 (v1 / MVP)

> Goal: `.goal/gigang-ops-mcp/GOAL.md` (gigang-ops-mcp-v1) · Linear: gigang-client 운영진 AI 조회·알림 도구(MCP), EES-222~227
> 이 문서는 SG-01(측정 계약·스펙 마감)의 산출물이다. AC-01(스펙)·AC-02(6개 ground-truth SQL)·AC-03(권한 매트릭스)을 충족한다.

## 1. 목적 · 범위

운영진(SQL·스키마 지식 없음)이 자기 AI 클라이언트에서 기강 운영 현황을 조회하고, 권한 있는 운영진이 특정 멤버에게 알림(푸시)을 보낸다.

- **In scope**: 6개 읽기 도구 + admin 게이트 `send_push` 1개. 개인 액세스 토큰(PAT) 인증. 팀 스코프. 감사 로그.
- **Non-goals**: 푸시 외 쓰기, 일반 크루원 접근, MCP 내 추천 규칙 내장(판단은 AI), OAuth.
- **원칙**: 도구는 **사실만** 반환(마지막 참석일·횟수 등), "누굴 추천/호출"은 로컬 AI가 판단.

## 2. 아키텍처

- **위치**: 기강 Next.js 앱 안 라우트 `app/api/mcp/[transport]/route.ts`, `mcp-handler`(구 `@vercel/mcp-adapter`)로 Streamable HTTP 노출. 앱과 함께 Vercel 배포.
  - ⚠️ 구현 착수 시 `node_modules/next/dist/docs/`와 mcp-handler 최신 문서 확인(AGENTS.md 규칙).
- **인증 미들**: 라우트 앞단에서 `Authorization: Bearer <token>` 검사 → `mcp_token_rel` 조회 → operator ctx `{ mem_id, team_id, is_admin }` 생성 → 각 도구에 주입.
- **DB 접근**: 서버 전용 service-role 클라이언트. **모든 쿼리는 ctx.team_id로 필터**(RLS 우회하므로 애플리케이션에서 스코프 강제). `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용, 클라 노출 금지.
- **푸시 발송**: 기존 `insertNotiMany`(`lib/notifications/insert-noti.ts`) 재사용 → 인앱 noti + 웹푸시 자동.

```
운영진 AI ──Bearer PAT──▶ app/api/mcp/[transport]/route.ts (mcp-handler)
                              │ auth wrapper → {mem_id, team_id, is_admin}
                    ┌─────────┴─────────┐
              읽기 도구 6              쓰기 도구 1 (admin)
              lib/mcp/queries          send_push → insertNotiMany + 감사행
                    └──── service-role, team_id 강제 ────▶ Supabase
```

## 3. 인증 · 권한 모델 (PAT)

### 3.1 토큰 발급/저장 (SG-03)

신규 테이블 `mcp_token_rel`:

| 컬럼 | 타입 | 비고 |
|---|---|---|
| token_id | uuid pk | |
| mem_id | uuid | mem_mst FK |
| team_id | uuid | 발급 시점 팀 |
| token_hash | text | **sha256(원문)** — 원문 미저장 |
| label | text | 사용자가 붙이는 이름(기기 구분) |
| created_at | timestamptz | |
| last_used_at | timestamptz null | 검증 성공 시 갱신 |
| expires_at | timestamptz null | null = 무기한 |
| revoked_at | timestamptz null | 폐기 시각 |

- **토큰 형식**: `gmcp_` + 32 bytes random(base64url). 발급 화면에서 **평문 1회만** 노출, 이후 hash만 보관.
- **발급 UI**: `(info)` 그룹에 "MCP 토큰" 화면 — 로그인 멤버가 label 지정해 생성·목록·폐기. `verifyAdmin` 불필요(본인 토큰), 단 팀 멤버여야 함.

### 3.2 검증

1. Bearer 토큰 sha256 → `mcp_token_rel`에서 `token_hash` 일치 & `revoked_at is null` & (`expires_at is null or expires_at > now()`) 조회. 없으면 **401**.
2. `team_mem_rel`에서 (mem_id, team_id, del_yn=false) 조회 → `team_role_cd`. `mem_st_cd != 'active'`이면 **401**(비활성 멤버 토큰 무효).
3. `is_admin = team_role_cd in ('owner','admin')`. ctx = `{ mem_id, team_id, is_admin }`. `last_used_at` 갱신.

### 3.3 권한 규칙

- **읽기 도구 6개**: 인증된 팀 멤버 전원 허용.
- **`send_push`**: `is_admin`만. 아니면 **403**.
- **민감정보 전면 차단**: `phone_no·email_addr·bank_nm·bank_acct_no`는 **어떤 도구도, 어떤 권한(admin 포함)도 반환하지 않는다.** 쿼리 select 목록에서 아예 제외 — 코드 레벨 불변식(M-03). `get_member_profile`은 생일·성별을 포함하되 연락처·계좌는 절대 미포함.

## 4. 도구 I/O 스키마

모든 도구는 ctx.team_id로 자동 스코프(파라미터로 team 받지 않음).

| 도구 | 입력 | 출력(행) | 권한 |
|---|---|---|---|
| `list_today_gatherings` | `date?`(KST, 기본 오늘) | gthr_id, gthr_nm, gthr_type_enm, stt_at, end_at, loc_txt, max_prt_cnt, attendee_cnt | 멤버 |
| `list_recent_members` | `limit?`(기본 10) | mem_id, mem_nm, join_dt, team_role_cd, mem_st_cd | 멤버 |
| `list_members_attendance` | `limit?` | mem_id, mem_nm, join_dt, attendance_cnt, last_attended_at | 멤버 |
| `get_member_profile` | `member_id`(uuid) \| `name` | mem_nm, birth_dt, gdr_enm, join_dt, team_role_cd, mem_st_cd, intro_txt, avatar_url | 멤버 (연락처·계좌 절대 미포함) |
| `list_gathering_non_attendees` | `gathering_id`(uuid) | mem_id, mem_nm, join_dt, attendance_cnt, last_attended_at | 멤버 |
| `list_push_status` | — | mem_id, mem_nm, mem_st_cd, push_enabled | 멤버 |
| `send_push` | `member_ids`(uuid[]), `title`, `message` | sent_cnt, audit_id | **admin** |

- 반환은 정렬된 JSON 배열. `list_members_attendance`·`list_gathering_non_attendees`는 `last_attended_at asc nulls first`(전혀/오래 안 나온 순)로 정렬해 주되, 최종 추천 판단은 AI가 한다.

## 5. Ground-truth SQL baseline (AC-02)

검증 기준 SQL. `:team_id`는 ctx에서 주입. KST = `Asia/Seoul`. 도구 출력은 아래 결과와 핵심 필드 기준 일치해야 M-01 PASS.

> **⚠️ team_mem_rel은 버전 테이블 — 모든 조회에 `and r.vers = 0` 필수.** (2026-07-24 SG-04에서 dev 실측·독립검증 확인) vers=0 미적용 시 활성멤버가 중복(dev 147 vs 정본 144)되고, vers=0가 'left'인 멤버가 vers>0 'active' 행으로 부활한다. 앱 전역 규약(`fetchMemMstWithTeamRel`·`auth.ts`)과 동일. 아래 baseline에 반영됨. (mem_mst는 vers가 아니라 del_yn으로 버저닝 — `m.del_yn=false`만으로 mem_id당 1행.)

### 5.1 list_today_gatherings
```sql
select g.gthr_id, g.gthr_nm, g.gthr_type_enm, g.stt_at, g.end_at, g.loc_txt, g.max_prt_cnt,
       count(a.attd_id) as attendee_cnt
from gthr_mst g
left join gthr_attd_rel a on a.gthr_id = g.gthr_id
where g.team_id = :team_id and g.del_yn = false
  and (g.stt_at at time zone 'Asia/Seoul')::date = :day   -- :day 기본 = (now() at time zone 'Asia/Seoul')::date
group by g.gthr_id
order by g.stt_at;
```

### 5.2 list_recent_members
```sql
select m.mem_id, m.mem_nm, r.join_dt, r.team_role_cd, r.mem_st_cd
from team_mem_rel r
join mem_mst m on m.mem_id = r.mem_id and m.del_yn = false
where r.team_id = :team_id and r.del_yn = false and r.vers = 0
order by r.join_dt desc nulls last, r.crt_at desc
limit :limit;   -- 기본 10
```

### 5.3 list_members_attendance
"참석" = 과거(이미 시작된) 모임에 참석 rel이 있는 것. `last_attended_at` = 그 중 최신 모임 시작시각.
```sql
select m.mem_id, m.mem_nm, r.join_dt,
       count(g.gthr_id) filter (where g.stt_at <= now()) as attendance_cnt,
       max(g.stt_at)   filter (where g.stt_at <= now()) as last_attended_at
from team_mem_rel r
join mem_mst m on m.mem_id = r.mem_id and m.del_yn = false
left join gthr_attd_rel a on a.mem_id = r.mem_id
left join gthr_mst g on g.gthr_id = a.gthr_id and g.team_id = :team_id and g.del_yn = false
where r.team_id = :team_id and r.del_yn = false and r.vers = 0 and r.mem_st_cd = 'active'
group by m.mem_id, m.mem_nm, r.join_dt
order by last_attended_at asc nulls first, attendance_cnt asc
limit :limit;   -- 옵션
```

### 5.4 get_member_profile
연락처·계좌(phone_no·email_addr·bank_nm·bank_acct_no)는 **select 목록에서 영구 제외** — 코드 불변식.
```sql
select m.mem_id, m.mem_nm, m.birth_dt, m.gdr_enm, m.avatar_url,
       r.join_dt, r.team_role_cd, r.mem_st_cd, r.intro_txt
from mem_mst m
join team_mem_rel r on r.mem_id = m.mem_id and r.team_id = :team_id and r.del_yn = false and r.vers = 0
where m.del_yn = false
  and (m.mem_id = :member_id or lower(m.mem_nm) = lower(:name));
```

### 5.5 list_gathering_non_attendees
해당 모임에 참석 rel이 없는 active 멤버 + 각자 마지막 참석일/횟수.
```sql
select m.mem_id, m.mem_nm, r.join_dt,
       count(g.gthr_id) filter (where g.stt_at <= now()) as attendance_cnt,
       max(g.stt_at)   filter (where g.stt_at <= now()) as last_attended_at
from team_mem_rel r
join mem_mst m on m.mem_id = r.mem_id and m.del_yn = false
left join gthr_attd_rel a on a.mem_id = r.mem_id
left join gthr_mst g on g.gthr_id = a.gthr_id and g.team_id = :team_id and g.del_yn = false
where r.team_id = :team_id and r.del_yn = false and r.vers = 0 and r.mem_st_cd = 'active'
  and not exists (
    select 1 from gthr_attd_rel x where x.gthr_id = :gathering_id and x.mem_id = r.mem_id)
group by m.mem_id, m.mem_nm, r.join_dt
order by last_attended_at asc nulls first, attendance_cnt asc;
```

### 5.6 list_push_status
```sql
select m.mem_id, m.mem_nm, r.mem_st_cd,
       exists(select 1 from push_sub_rel p where p.team_id = :team_id and p.mem_id = r.mem_id) as push_enabled
from team_mem_rel r
join mem_mst m on m.mem_id = r.mem_id and m.del_yn = false
where r.team_id = :team_id and r.del_yn = false and r.vers = 0 and r.mem_st_cd = 'active'
order by push_enabled asc, m.mem_nm;
```

## 6. 권한 · 스코프 게이트 매트릭스 (AC-03)

| # | 토큰/역할 | 호출 | 기대 |
|---|---|---|---|
| G-1 | owner/admin | `send_push` | ALLOW (발송 + 감사행) |
| G-2 | member | `send_push` | DENY 403 (아무것도 발송 안 됨) |
| G-3 | 토큰 없음/형식오류 | 임의 도구 | DENY 401 |
| G-4 | 폐기(revoked)/만료(expired) 토큰 | 임의 도구 | DENY 401 |
| G-5 | 비활성(mem_st_cd≠active) 멤버 토큰 | 임의 도구 | DENY 401 |
| G-6 | 팀 T 토큰 | 읽기 도구 | 팀 T 행만 반환, 타 팀 데이터 0건 |
| G-7 | 임의 토큰(admin 포함) | `get_member_profile` | 응답에 phone_no·email_addr·bank_nm·bank_acct_no **미포함** |

M-02 = 위 매트릭스 100% 통과. (민감정보는 권한 분기 없이 전면 차단 — G-7은 M-03 불변식과도 연결.)

## 7. 에러 처리

- 401: 토큰 없음/무효/폐기/만료/비활성. 402 없음. 403: 비-admin의 write 또는 민감정보 요청.
- 400: 잘못된 파라미터(비-uuid member_id, 존재하지 않는 gathering_id, member_id·name 둘 다 없음).
- 도구 내부 오류는 MCP tool error로 **안전 메시지만** 반환(스택·시크릿·SQL 비노출).
- `send_push` 부분 실패(일부 수신자 푸시 실패)는 인앱 noti는 성공 처리하고 `sent_cnt`와 실패 수를 함께 반환(insertNotiMany는 fire-and-forget 푸시).

## 8. 감사 로그

신규 테이블 `mcp_audit_log`: audit_id, actor_mem_id, team_id, tool_nm, params_json(민감정보 마스킹), result_summary, created_at. **`send_push` 성공 시 반드시 1행**(AC-18). 읽기 도구는 선택(MVP는 write만 필수).

## 9. 테스트 전략

- **단위**: 토큰 검증(hash 일치·revoke·expire·비활성), 권한 해석(is_admin), 민감정보 마스킹.
- **auth.test** (SG-02, M-02 G-3~G-6): 토큰 유무/무효/폐기/스코프.
- **tool-correctness.test** (SG-04, M-01): 6개 도구 출력 vs §5 baseline SQL 일치(dev seed 또는 고정 fixture).
- **send-push.test** (SG-05, M-02 G-1·G-2·G-7·G-8 + AC-18): admin 발송·member 거부·감사행·민감정보.
- vitest `server-only` import 함정 주의([[troubleshooting/vitest-server-only-trap]] 위키): insertNoti 계열 import 시 vi.mock 필수.

## 10. 데이터 모델 참조 (2026-07-24 dev 실측)

- `gthr_mst`(team_id, gthr_nm, gthr_type_enm[general|regular], stt_at, end_at, loc_txt, max_prt_cnt, del_yn, short_id)
- `gthr_attd_rel`(gthr_id, mem_id, crt_at) — 취소는 하드 DELETE(이력은 gthr_attd_hist)
- `mem_mst`(mem_id, mem_nm, gdr_enm, birth_dt, phone_no, email_addr, bank_nm, bank_acct_no, del_yn)
- `team_mem_rel`(team_id, mem_id, team_role_cd[owner|admin|member], mem_st_cd[active|inactive|left], join_dt, del_yn)
- `push_sub_rel`(team_id, mem_id, endpoint, ...) — 행 존재 = 푸시 구독
- `noti_mst` — insertNoti 대상

## 11. 가정 · 미결

- A-01: 비개발자 운영자가 로그인→토큰복사→AI에 붙여넣기를 스스로 완료(SG-06에서 검증).
- A-02: mcp-handler가 기강 Vercel 런타임에서 정상 동작(SG-02에서 검증).
- 미결: `list_recent_members`의 "최근" 기준을 join_dt로 볼지 crt_at로 볼지 — join_dt 우선(가입일), null이면 crt_at fallback로 확정.
- 미결: 읽기 도구도 감사 로깅할지 — MVP는 write만. 필요 시 확장.
