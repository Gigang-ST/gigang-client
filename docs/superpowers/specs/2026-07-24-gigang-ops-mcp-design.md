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

판정 기준은 하나다 — **앱에서 관리자에게만 보이는 데이터는 MCP 에서도 admin 에게만.** 토큰은 가입 완료 멤버 누구나 발급하므로(§3.1), 이 선을 넘으면 MCP 가 앱보다 넓은 창구가 된다.

- **읽기 도구**: 원칙적으로 인증된 팀 멤버 전원 허용. 단 아래 둘은 좁힌다(#496, 2026-08-21).
  - **`list_members_attendance`**: `is_admin`만. 같은 통계가 앱엔 관리자 전용 화면(`app/(info)/admin/members/participation-section.tsx`)에만 있다. 거부는 쿼리 실행 **이전**에 — 뽑아서 버리지 않는다.
  - **`list_gathering_non_attendees`의 `attendance_cnt`·`last_attended_at`**: admin 응답에만 싣는다. 바로 위 도구와 **같은 통계**라, 하나만 막으면 옆 도구로 그대로 나간다(막은 문 옆의 안 막은 창문). 도구째 막지는 않는다 — "이 벙에 누가 안 왔나"는 앱에서 참석자 목록이 공개라 뒤집으면 나오는 사실이다. 비-admin 경로는 참석 이력을 **조회조차 하지 않고**, 정렬도 **이름순**으로 바꾼다: `last_attended_at` 순으로 늘어놓으면 값이 없어도 줄 순서가 곧 "누가 더 오래 안 나왔나"라서 숫자만 지우는 건 가린 척이다.
  - **`get_member_profile`의 `birth_dt`·`gdr_enm`**: admin 응답에만 싣는다. 공개 프로필 카드 RPC(`get_public_member_card`)에 없는 값이고, 앱에선 관리자 화면(`admin/members`·`admin/dues/exemptions`)과 본인 프로필 수정에만 보인다. **도구 자체는 멤버 허용을 유지**한다 — 뉴비↔모임 매칭(러닝 프로필 조회)이 이 MCP 의 주 용도이고 나머지 필드는 앱에서 이미 공개다. 구현은 **비-admin select 목록에서 두 컬럼을 빼는** 방식이다(응답 후처리로 지우면 새 반환 경로가 생길 때 빠뜨린다).
- **쓰기 도구(`send_push`·`create_gathering`)**: `is_admin`만. 아니면 **403**. 되돌리기 어렵고 둘 다 팀에 알림이 나간다.
  - **서버 액션을 재사용할 수 없다**(#485에서 확인). `app/actions/**` 는 `withMember`/`withActive` → `getCurrentMember()` → **Supabase 세션 쿠키**에 묶여 있는데 MCP 요청은 PAT 만 들고 온다. 팀도 `getRequestTeamContext()`(Host 파싱)가 아니라 `ctx.team_id` 에서 와야 한다. 그래서 쓰기 경로는 `lib/mcp/` 에 별도로 두되 **검증 스키마(`lib/validations/*`)는 앱과 공유**한다 — 앱으로 만든 것과 MCP 로 만든 것이 다르게 굴면 안 된다.
  - **일시 입력은 KST 벽시계 형식 하나만 받는다**(`YYYY-MM-DD HH:mm`). `Z`·오프셋 표기를 섞어 받으면 `dayjs.tz(x,'Asia/Seoul')` 가 그 값을 다시 KST 로 해석해 **9시간이 조용히 밀린다** — 에러 없이 엉뚱한 시각에 벙이 선다.
- **거부 타입은 하나로 공유한다**: `ToolDeniedError`(`lib/mcp/queries.ts`). `SendPushDeniedError`가 이를 상속하고, 라우트는 이 타입 하나만 잡아 사유를 노출한다. 게이트가 늘 때마다 라우트 catch 목록을 손대야 하면 언젠가 한 곳을 빠뜨려 사유가 일반 메시지로 마스킹된다.
- **민감정보 전면 차단**: `phone_no·email_addr·bank_nm·bank_acct_no`는 **어떤 도구도, 어떤 권한(admin 포함)도 반환하지 않는다.** 쿼리 select 목록에서 아예 제외 — 코드 레벨 불변식(M-03). 이 불변식은 권한 분기가 아니라 절대선이며, 위의 생일·성별 분기와는 층이 다르다(저쪽은 admin이면 보인다).

## 4. 도구 I/O 스키마

모든 도구는 ctx.team_id로 자동 스코프(파라미터로 team 받지 않음).

| 도구 | 입력 | 출력(행) | 권한 |
|---|---|---|---|
| `list_today_gatherings` | `date?`(KST, 기본 오늘) | gthr_id, gthr_nm, gthr_type_enm, stt_at, end_at, loc_txt, max_prt_cnt, desc_txt, attendee_cnt | 멤버 |
| `list_recent_members` | `limit?`(기본 10) | mem_id, mem_nm, join_dt, team_role_cd, mem_st_cd, near_stn, avg_run_dist_km, avg_pace, join_purposes | 멤버 |
| `list_members_attendance` | `limit?` | mem_id, mem_nm, join_dt, attendance_cnt, last_attended_at | **admin** (#496) |
| `get_member_profile` | `member_id`(uuid) \| `name` | mem_nm, join_dt, team_role_cd, mem_st_cd, intro_txt, avatar_url, near_stn, avg_run_dist_km, avg_pace, join_purposes **+ admin 한정 birth_dt·gdr_enm**(#496) | 멤버 (연락처·계좌 절대 미포함) |
| `list_gathering_non_attendees` | `gathering_id`(uuid) | mem_id, mem_nm, join_dt **+ admin 한정 attendance_cnt·last_attended_at**(#496) | 멤버 |
| `list_push_status` | — | mem_id, mem_nm, mem_st_cd, push_enabled | 멤버 |
| `send_push` | `member_ids`(uuid[]), `title`, `message` | sent_cnt, audit_id | **admin** |
| `create_gathering` | `gthr_nm`, `gthr_type_enm`, `sprt_cd`, `stt_at`(KST 벽시계), `end_at?`, `loc_txt?`, `desc_txt?`, `max_prt_cnt?`, `dry_run?` | dry_run, gthr_id, short_id, gthr_url, stt_at_kst, end_at_kst, notified_cnt, audit_id | **admin** (#485) |

- 반환은 정렬된 JSON 배열. `list_members_attendance`·`list_gathering_non_attendees`는 `last_attended_at asc nulls first`(전혀/오래 안 나온 순)로 정렬해 주되, 최종 추천 판단은 AI가 한다. **단 비-admin 의 `list_gathering_non_attendees` 는 이름순**이다(#496) — 이 정렬 자체가 admin 전용 통계를 순서로 흘리기 때문이다.
- `near_stn`·`avg_run_dist_km`·`avg_pace`·`join_purposes`(2026-07-25 추가)는 가입 온보딩 러닝 프로필(`mem_onbd_prf`, mem_id 키·팀무관)에서 조인. `avg_pace`·`join_purposes`는 각각 `avg_pace_cd`·`join_purp_cds`를 `lib/validations/member.ts`의 `PACE_LABELS`·`JOIN_PURP_SHORT_LABELS`로 디코딩한 라벨(알 수 없는 코드는 코드 원문 유지). 온보딩 행이 없는 멤버는 전부 null/빈 배열. 유입경로(join_src_cd)·전화·이메일·계좌는 여전히 영구 제외(M-03).

### 4.1 마일리지런 개인 도구 (#497)

위 도구들이 **팀을 들여다보는** 것이라면 이쪽은 **내 것**이다. 대상 멤버를 인자로 받지 않고 `ctx.mem_id` 로만 스코프하며, **admin 우회가 없다** — 앱의 서버 액션은 admin 이 남의 기록을 고칠 수 있지만, 이 창구는 "내 기록을 보고 넣는" 자리라 그 예외가 없는 편이 놀랍지 않다.

| 도구 | 입력 | 출력(행) | 권한 |
|---|---|---|---|
| `list_my_activities` | `date?` \| `from?`·`to?` | act_id, act_dt, sport(+label), distance_km, elevation_m, base_mlg, applied_mults, final_mlg, review, has_photo | 본인 |
| `get_my_mileage` | `month?`(YYYY-MM) | month, evt_nm, goal_mlg, achv_mlg, achv_yn, remaining_mlg, act_cnt, lst_act_dt | 본인 |
| `list_mileage_multipliers` | `active_only?` | mult_id, mult_nm, mult_val, stt_dt, end_dt, active_yn, in_effect_today | 본인 |
| `log_my_activity` / `log_my_activities` | `act_dt`, `sport`, `distance_km`, `elevation_m?`, `review?`, `multipliers?`(배율 **이름** 배열) (배열은 최대 20건) | saved_cnt, activities[], month_after, notice, title_eval_seeds | 본인 |
| `update_my_activity` | `act_id` + 위 필드 | act_id, before, after, month_after | 본인 |
| `delete_my_activity` | `act_id` | deleted, month_after | 본인 |

- **`evt_id` 를 인자로 받지 않는다.** 대화에서 이벤트 uuid 를 부를 일이 없어, 서버가 "진행 중 + 내가 승인된 참가" 이벤트를 찾아 채운다(`resolveMyParticipation`).
- **배율은 자동으로 붙지 않는다 — 이름으로 받는다**(`multipliers?: string[]`, 기본 미적용). 배율마다 성립 조건이 다른데(모임 참석·벙주/참석자·LSD 인원수·주당 횟수) `evt_mlg_mult_cfg` 에는 그 조건을 적을 칼럼조차 없어 **서버가 판정할 수 없다.** 처음엔 "대화에서 uuid 를 부를 일이 없다"는 이유로 그날 걸린 것을 전부 자동 적용했는데, 혼자 1km 뛴 기록에 `3인이상 LSD`·`모임참석(벙주)`·`모임참석(참석자)`·`정기런` 이 동시에 곱해져 **최대 90% 부풀려졌다**(#504 — 벙주와 참석자는 애초에 양립하지 않는다). 앱 폼의 체크박스와 같은 **자기신고**로 되돌렸고, uuid 문제는 uuid 대신 **`mult_nm` 을 받는 것**으로 푼다(`list_mileage_multipliers` 가 이미 이름을 돌려준다).
  - 못 찾은 이름은 **조용히 빼지 않고 거부**하고 그날 고를 수 있는 목록을 오류에 싣는다 — 침묵 탈락은 "붙는 줄 알았는데 안 붙은" 마일리지를 남기는데 보증금 환급이 걸린 숫자다.
  - `update_my_activity` 는 인자를 **생략하면 기존 선택을 잇고**(앱 수정 폼의 프리필과 같다), `[]` 를 명시하면 전부 뗀다.
- **수정은 PATCH 다 — 안 준 선택 항목은 건드리지 않는다.** 한때 `multipliers` 만 "생략=유지"였고 `review`·`elevation_m` 은 "생략=null/0 으로 설정"이라 **같은 호출 안에서 방향이 반대**였다. 거리 오타만 고치러 온 호출에서 후기가 조용히 날아갔고, 고도는 러닝 마일리지(거리 + 고도/100)에 직접 들어가 **숫자까지 틀어졌다.** 지우려면 명시한다: `review=null` · `elevation_m=0` · `multipliers=[]`. 등록에는 이을 값이 없으므로 생략이 그대로 "없음"이다.
  - 후보 선별(`listMultipliersActiveOn`)과 실제 적용(`buildAppliedMults`)은 **같은 판정 함수**를 쓴다 — 갈리면 "적용됐다는데 마일리지가 안 늘었다"가 된다.
  - 벙주/참석자 상호배타는 **강제하지 않는다.** 조건 메타데이터가 없어 한글 이름 부분일치로 하드코딩해야 하는데 운영진이 배율 이름을 자유롭게 바꾼다. 기본 미적용이라 실수로 둘 다 붙을 일 자체가 없고, 이는 앱 폼과 같은 수준이다.
- **사진은 못 받는다**(`File` 이 JSON 경계를 못 넘는다). 사진이 기강이야기 게재 게이트이므로 **MCP 기록은 전광판에 안 뜬다** — 도구 description 과 응답 `notice` 에 명시한다. 사진이 붙은 기록의 삭제도 거부하고 앱으로 보낸다(Storage 파일 정리가 거기 있다).
- **계산 코어는 앱과 공유한다**(`lib/mileage-run.ts`): 날짜 규칙·배율 적용·목표 연쇄 재계산. 보증금 환급이 걸린 계산이라 복사하면 한쪽만 고쳐지는 날 사람 돈이 어긋난다. `next/*` 부수효과(`revalidatePath`·`after`)는 코어가 아니라 각 호출부(라우트/액션)가 맡는다.
- **`lib/queries/project-data.ts` 를 재사용하지 않는다.** `unstable_cache`·React `cache()` 로 감싸여 있어 방금 넣은 기록이 최대 60초 안 보인다 — "넣고 바로 확인"이 이 도구들의 기본 흐름이라 치명적이다.
- 팀 전체를 건드리는 쓰기(참가 승인·배율 생성·이벤트 관리)는 **계속 제외**한다. 필요해지면 되돌리기·감사 설계를 붙여 별도 이슈로.

## 5. Ground-truth SQL baseline (AC-02)

검증 기준 SQL. `:team_id`는 ctx에서 주입. KST = `Asia/Seoul`. 도구 출력은 아래 결과와 핵심 필드 기준 일치해야 M-01 PASS.

> **⚠️ team_mem_rel은 버전 테이블 — 모든 조회에 `and r.vers = 0` 필수.** (2026-07-24 SG-04에서 dev 실측·독립검증 확인) vers=0 미적용 시 활성멤버가 중복(dev 147 vs 정본 144)되고, vers=0가 'left'인 멤버가 vers>0 'active' 행으로 부활한다. 앱 전역 규약(`fetchMemMstWithTeamRel`·`auth.ts`)과 동일. 아래 baseline에 반영됨. (mem_mst는 vers가 아니라 del_yn으로 버저닝 — `m.del_yn=false`만으로 mem_id당 1행.)

### 5.1 list_today_gatherings
```sql
select g.gthr_id, g.gthr_nm, g.gthr_type_enm, g.stt_at, g.end_at, g.loc_txt, g.max_prt_cnt, g.desc_txt,
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
select m.mem_id, m.mem_nm, r.join_dt, r.team_role_cd, r.mem_st_cd,
       o.near_stn_nm, o.avg_run_dist_km, o.avg_pace_cd, o.join_purp_cds
from team_mem_rel r
join mem_mst m on m.mem_id = r.mem_id and m.del_yn = false
left join mem_onbd_prf o on o.mem_id = r.mem_id
where r.team_id = :team_id and r.del_yn = false and r.vers = 0
order by r.join_dt desc nulls last, r.crt_at desc
limit :limit;   -- 기본 10
-- 도구 출력의 avg_pace·join_purposes는 코드를 PACE_LABELS·JOIN_PURP_SHORT_LABELS로 디코딩한 라벨.
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
       r.join_dt, r.team_role_cd, r.mem_st_cd, r.intro_txt,
       o.near_stn_nm, o.avg_run_dist_km, o.avg_pace_cd, o.join_purp_cds
from mem_mst m
join team_mem_rel r on r.mem_id = m.mem_id and r.team_id = :team_id and r.del_yn = false and r.vers = 0
left join mem_onbd_prf o on o.mem_id = m.mem_id
where m.del_yn = false
  and (m.mem_id = :member_id or lower(m.mem_nm) = lower(:name));
-- 도구 출력의 avg_pace·join_purposes는 코드를 PACE_LABELS·JOIN_PURP_SHORT_LABELS로 디코딩한 라벨.
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
| G-9 | member | `list_members_attendance` | DENY (쿼리 실행 0회) — #496 |
| G-10 | member | `get_member_profile` | 응답에 birth_dt·gdr_enm **키 자체가 없음**(select 에서 제외) — #496 |
| G-11 | owner/admin | `get_member_profile` | 응답에 birth_dt·gdr_enm 포함 — #496 |
| G-17 | member | `list_gathering_non_attendees` | 응답에 attendance_cnt·last_attended_at **키 없음** + 이름순 정렬 + 참석 이력 쿼리 0회 — #496 |
| G-12 | member | `create_gathering` | DENY (모임·알림·감사 0건) — #485 |
| G-13 | owner/admin | `create_gathering` (`dry_run=true`) | 어떤 테이블에도 쓰지 않고 해석 결과만 반환 — #485 |
| G-14 | 임의 토큰(admin 포함) | `update_my_activity`/`delete_my_activity` (남의 act_id) | DENY — 대상 행 무변경, 존재 여부도 미노출 — #497 |
| G-15 | 임의 토큰 | `list_my_activities` | 내 `prt_id` 행만. 남의 기록 0건 — #497 |
| G-16 | 미승인 참가자 | 마일리지런 개인 도구 전부 | DENY (승인 안내 메시지) — #497 |

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
