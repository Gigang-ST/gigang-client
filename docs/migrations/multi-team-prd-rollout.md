# 멀티팀(울산지부) prd 적용 순서

브랜치 `feature/multi-team` · PR #649. **이 문서의 "배포 전" 단계를 끝내지 않고 머지·배포하면 기능이 깨진다.**
단계를 하나 끝낼 때마다 아래 표의 prd 칸을 체크한다. 새 마이그레이션이 생기면 표와 순서에 이어 붙인다.

## 현황

| # | 항목 | 파일 | dev | prd |
|---|---|---|---|---|
| 0-a | 본인 등급·상태 셀프 변경 막기 (PR #647) | `20261109100000_team_mem_rel_update_admin_only.sql` | ✅ | ✅ (SQL Editor, 이력 없음) |
| 0-b | 울산 팀 행 (`c0ffee00-…-0002`, `ulsan`, `울산지부`) | `20261109110000_seed_team_ulsan.sql` | ✅ | ✅ |
| 1 | 팀 설정 `team_cfg` + 카톡 발송 이력 팀 칸 | `20261109120000_team_cfg.sql` | ✅ | ☐ |
| 2 | 기강 카톡방을 팀 설정에 등록 | (아래 SQL) | ✅ | ☐ |
| 3 | 알림 수신 설정 팀별 | `20261109130000_noti_pref_cfg_team.sql` | ✅ | ☐ |
| 4 | 변경 이력 `chg_hist` + 트리거 | `20261109140000_chg_hist.sql` | ✅ | ☐ |
| 5 | RLS 정리(마일리지 읽기·팀 칸 고정·배치·탈퇴자·미납 함수) | `20261109150000_multi_team_rls.sql` | ✅ | ☐ |
| 6 | 공개 조회 함수 팀 구분(댓글 수·피드 활동 수·카드 포인트) | `20261109160000_multi_team_rpc_scope.sql` | ✅ | ☐ |
| 7 | 기강 포인트 팀별 적립·회수 | `20261109170000_points_per_team.sql` | ✅ | ☐ |
| 8 | 울산 시작 준비(배치 팀별·칭호 복사·가입 정보 팀별·셀프 가입 active 고정) | `20261109180000_team_start_ready.sql` | ✅ | ☐ |
| 9 | 팀 설정 나머지(이펙트 팀별·회비 분류 팀 칸·기강 계좌/채널 등록) | `20261109190000_team_settings.sql` | ✅ | ☐ |
| 10 | 기강 오픈채팅 비밀번호를 팀 설정에 등록 | (아래 SQL — 사람이 직접) | ☐ | ☐ |
| 11 | 캐시 무효화 웹훅에 팀 싣기 | `20261109200000_revalidate_webhook_team.sql` | ✅ | ☐ |
| 12 | 건의 팀별 | `20261109210000_fdbk_team.sql` | ✅ | ☐ |
| 13 | 모임·일정 읽기 — 로그인한 비회원도 비로그인과 같게 | `20261109220000_gthr_sch_post_select_authenticated_public.sql` | ✅ | ☐ |
| 14 | 대회 원본·종목 관리자 정책에서 기강 id 고정 걷기 | `20261109230000_comp_admin_policy_any_team.sql` | ✅ | ☐ |

바깥 설정(이미 끝남): Vercel 도메인 `ulsan.gigang.team`(운영) · `dev.ulsan.gigang.team`(dev),
Supabase Redirect URLs `https://ulsan.gigang.team/auth/callback`(prd) · dev 두 줄.

## 배포 전 (prd SQL Editor 또는 MCP)

순서대로 한다. 각 단계 끝의 확인 쿼리가 기대값이 아니면 멈춘다.

### 1. `20261109120000_team_cfg.sql`

파일 내용을 그대로 실행한다. 옛 코드와 함께 돌아도 안전하다(옛 코드는 이 테이블을 모른다).

```sql
-- 확인: 테이블·트리거·RLS, 발송 이력의 팀 칸이 다 채워졌는지
select (select relrowsecurity from pg_class where oid = 'public.team_cfg'::regclass) as rls_on,
       (select count(*) from pg_trigger where tgrelid = 'public.team_cfg'::regclass and not tgisinternal) as triggers, -- 1
       (select count(*) from kakao_send_hist where team_id is null) as hist_null_team;                               -- 0
```

### 2. 기강 카톡방 등록 — ⚠️ 빠지면 배포 순간 기강 카톡 공지가 멈춘다

값은 **운영 Vercel 프로젝트(`gigang-client`)의 환경변수 `KAKAO_ROOM_ID`**(없으면 `KAKAO_ROOM`)다.
새 코드는 환경변수 방을 읽지 않고 팀 설정에서만 방을 찾는다.

```sql
INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
VALUES ('c0ffee00-0000-4000-8000-000000000001', 'kakao.room_id', to_jsonb('여기에_운영_방ID'::text));

-- 확인
select team_id, cfg_val_json from team_cfg where cfg_cd = 'kakao.room_id' and vers = 0 and del_yn = false;
```

울산은 넣지 않는다 — 방이 없으면 울산 공지는 보내지 않는다(기강 방으로 새지 않는다). 울산이 노티봇을 쓰게 되면 그때 같은 INSERT 로 울산 방을 넣는다.

### 3. `20261109130000_noti_pref_cfg_team.sql` — **배포 직전에**

⚠️ 이 마이그레이션은 옛 코드와 맞지 않는다. 적용 후 새 코드가 배포되기 전까지 **알림 수신 설정 저장이 실패한다**
(유니크 제약이 바뀌고 `team_id` 가 필수가 된다). 알림 발송 자체는 영향 없다. 그래서 머지·배포 직전에 실행한다.

```sql
-- 확인
select (select count(*) from noti_pref_cfg where team_id is null) as null_team, -- 0
       (select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint
         where conrelid = 'public.noti_pref_cfg'::regclass and contype = 'u') as uniq; -- UNIQUE (team_id, mem_id, noti_type_enm)
```

### 4. `20261109140000_chg_hist.sql`

옛 코드와 함께 돌아도 안전하다(이력만 쌓이고, 행위자 헤더가 없으면 "누가"가 비어 남는다).

```sql
-- 확인: 대상 5개 테이블에 트리거
select tgrelid::regclass, tgname from pg_trigger where tgname = 'chg_hist_capture' order by 1; -- 5행
```

### 5. `20261109150000_multi_team_rls.sql`

옛 코드와 함께 돌아도 안전하다(앱의 서버 쓰기는 service_role 이라 정책을 안 거치고, 앱은 팀 칸을 바꾸지 않는다).
**`team_mem_rel_select_own` 정책이 같은 파일 안에서 먼저 만들어지는지** 본다 — 이게 빠진 채 팀 판정 함수만 바뀌면
탈퇴자가 자기 소속 행을 못 읽어 온보딩 화면으로 튕긴다.

```sql
-- 확인: 탈퇴자 한 명으로 세션을 흉내 내 본인 행이 보이는지(트랜잭션 끝에 되돌린다)
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select coalesce(m.oauth_kakao_id, m.oauth_google_id, m.mem_id)
                            from mem_mst m join team_mem_rel r on r.mem_id = m.mem_id and r.vers = 0 and r.del_yn = false
                            where r.mem_st_cd = 'left' and m.vers = 0 limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select (select count(*) from team_mem_rel where mem_id = v2_rls_resolve_mem_id() and vers = 0) as own_rel, -- 1
       (select count(*) from gthr_mst) as gatherings;                                                  -- 0
rollback;
```

### 6. `20261109160000_multi_team_rpc_scope.sql`

함수 6개의 **고칠 문구만 바꾸는** 마이그레이션이다(통째로 다시 쓰지 않는다). 문구가 정확히 한 곳에 있지 않으면
전체가 중단되고 아무것도 안 바뀐다 — 그러면 prd 함수 본문이 예상과 다른 것이니 멈추고 확인한다.
2026-11-09 기준 dev·prd 본문은 `get_public_member_card` 만 주석·공백이 다르고 나머지는 같다(문구는 양쪽에 다 있다).
옛 코드와 함께 돌아도 안전하다(옛 코드는 activity_score 를 숫자로 읽지만, 쓰는 곳이 본인 프로필뿐이라 본인에겐 값이 온다).

```sql
-- 확인: 8곳이 다 바뀌었는지
select p.proname,
  (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'team_id = p_team_id', ''))) / length('team_id = p_team_id') as team_filters,
  (pg_get_functiondef(p.oid) like '%THEN s.activity_score END%') as score_owner_only
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_public_team_competitions','get_public_team_gatherings','get_public_team_sch_posts',
                    'get_schedule_paged','get_team_story_feed','get_public_member_card')
order by 1;
-- get_schedule_paged 는 cm.team_id 3곳, get_team_story_feed 는 etm.team_id 가 있어야 하고, member_card 는 score_owner_only = true
```

### 7. `20261109170000_points_per_team.sql`

포인트 트리거 함수만 바꾼다(앱 코드는 이 함수들을 직접 부르지 않는다). 옛 코드와 같이 돌아도 안전하다.
원장(`pt_txn_hist`)의 기존 행은 안 건드린다.

```sql
-- 확인: 새 시그니처가 있고 옛 것은 없어야 한다
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('pt_net_by_ref','pt_net_mlg_record','pt_post_record_mlg_auto_cnt','pt_post_record_amt_for')
order by 1, 2;
-- pt_net_by_ref 는 3인자·4인자 둘, 나머지는 첫 인자가 p_team_id 인 것 하나씩
```

### 8. `20261109180000_team_start_ready.sql`

- 배치 유일 조건을 `(job_cd, team_id)` 로 바꾸고 기강 배치 4개를 울산에 복사한다.
- 기강 **자동** 칭호를 울산에 복사한다(수여 칭호·특정 회원 기준 칭호 '서브현근' 제외). prd 는 기강 100개 중 자동만.
- 새 테이블 `team_mem_onbd_rel`(팀별 가입 목적·유입 경로·첫 모임 약속)을 만들고 기강 값을 옮긴다.
  회원 카드·기강이야기 함수의 가입 목적을 새 테이블에서 읽게 바꾼다(함수별로 다 바꾼 뒤 한 번에 다시 만든다).
- 셀프 가입 정책에 `mem_st_cd = 'active'` 를 더한다.

⚠️ **배포 전 옛 코드는 가입 정보를 옛 칸(`mem_onbd_prf`)에만 쓴다.** 8번 적용과 배포 사이에 가입한 사람·
러닝 프로필을 고친 사람의 가입 목적은 새 테이블에 없을 수 있다 → 배포 뒤 아래 "옮기기 다시"를 한 번 더 돌린다.

```sql
-- 확인
select (select count(*) from batch_job_mst) as jobs,                        -- 8 (팀당 4)
       (select count(*) from ttl_mst t join team_mst m using (team_id) where m.team_cd = 'ulsan' and t.vers = 0) as ulsan_titles,
       (select count(*) from team_mem_onbd_rel) as onbd_new,
       (select count(*) from mem_onbd_prf) as onbd_old,                       -- onbd_new 와 같거나 조금 적다(기강 소속이 없는 행)
       (pg_get_functiondef('public.get_public_member_card(uuid,uuid)'::regprocedure) like '%tj.join_purp_cds%') as card_ok,
       (pg_get_functiondef('public.get_team_story_feed(uuid,uuid)'::regprocedure) like '%tj.join_purp_cds%') as feed_ok;
```

### 9. `20261109190000_team_settings.sql`

- `team_effect_cfg`(팀별 이펙트 등급·사용 여부·해금 조건)를 만들고 기강 값을 옮긴다. `effect_mst` 는 안 바꾼다
  (옛 코드는 계속 effect_mst 를 읽고 쓴다 — 배포 전엔 기강 관리자가 이펙트를 바꾸지 않게 한다. 바꾸면 새 코드에선 안 보인다).
- `cmm_cd_mst.team_id`(NULL = 공용) 칸을 더한다. 기존 회비 분류는 공용으로 남는다.
- 기강 모임 계좌·채널 주소(오픈채팅·인스타·소모임·가민)를 기강 팀 설정에 넣는다.
- 울산은 `project.show_intro = false` — 진행 중인 프로젝트가 없을 때 마일리지런 소개 대신 "진행 중인 프로젝트가 없어요"만 보인다.
  ⚠️ **새 코드는 코드에 박힌 기강 계좌·채널을 더 이상 안 본다** — 이게 빠진 채 배포하면 기강 화면에서 계좌·채널이 사라진다.

```sql
-- 확인
select (select count(*) from team_effect_cfg) as eff_rows,               -- effect_mst 행 수와 같다
       (select count(*) from effect_mst) as eff_base,
       (select string_agg(c.cfg_cd, ', ' order by c.cfg_cd) from team_cfg c join team_mst t using (team_id)
         where t.team_cd = 'gigang' and c.vers = 0) as gigang_cfg;        -- bank.team_account, kakao.room_id, social.channels
-- 울산: select cfg_cd, cfg_val_json from team_cfg c join team_mst t using (team_id) where t.team_cd = 'ulsan' and c.vers = 0;  -- project.show_intro = false
```

### 10. 기강 오픈채팅 비밀번호 — 사람이 직접 (비밀값이라 마이그레이션에 없다)

새 코드는 팀 설정 `social.kakao_open_chat_password` 를 읽는다. **기강만** 이 행이 없으면 전환용으로 예전 환경변수
`KAKAO_CHAT_PASSWORD` 를 본다(`lib/team-social.ts`) — 그래서 배포 전에 안 넣어도 기강 화면은 안 깨진다.
다른 팀엔 환경변수를 절대 쓰지 않는다. 값은 Vercel 환경변수에 있는 그 비밀번호다(채팅에 붙여 넣지 말고 SQL Editor 에서 직접).

```sql
insert into public.team_cfg (team_id, cfg_cd, cfg_val_json)
values ('c0ffee00-0000-4000-8000-000000000001', 'social.kakao_open_chat_password', to_jsonb('여기에_비밀번호'::text));
```

### 11. `20261109200000_revalidate_webhook_team.sql`

캐시 무효화 트리거(`revalidate_records`)가 웹훅 body 에 그 행의 팀(`team_id`)을 같이 보낸다. 새 앱은 그 팀 캐시만 털고,
옛 앱은 `team_id` 를 무시하고 지금처럼 전부 턴다 — **배포 전후 언제 적용해도 안전하다.**

```sql
-- 확인: 모임 하나를 건드려 대기열에 쌓인 요청 body 에 team_id 가 있는지(곧 처리돼 사라지므로 바로 본다)
update gthr_mst set upd_at = upd_at where gthr_id = (select gthr_id from gthr_mst order by crt_at desc limit 1);
select id, convert_from(body, 'utf8') from net.http_request_queue order by id desc limit 1;
-- {"table": "gthr_mst", "team_id": "c0ffee00-…-0001"}
```

### 12. `20261109210000_fdbk_team.sql`

건의(`fdbk_mst`)에 팀 칸을 더하고 기존 행(prd 5건, 전부 기강)을 기강으로 채운다. **기본값을 기강으로 둔다** —
배포 전 옛 코드는 팀 없이 넣으므로, 기본값이 없으면 배포 전까지 건의 제출이 실패한다. 배포 뒤 기본값을 지운다(아래).

```sql
-- 확인: 빈 팀 없음, 전부 기강
select t.team_cd, count(*) from fdbk_mst f join team_mst t using (team_id) group by 1;
```

### 13. `20261109220000_gthr_sch_post_select_authenticated_public.sql`

모임(`gthr_mst`)·일정(`sch_post_mst`)의 로그인 읽기 정책을 비로그인과 같은 `del_yn = false` 로 맞춘다. 그 팀 회원이
아니면 로그인했어도 비로그인처럼 보여야 하는데, 로그인 정책만 "그 팀 회원"을 요구해 울산 주소에서 가입 중인 사람·
기강 회원이 비로그인보다 덜 봤다. 같은 행을 비로그인이 이미 읽으므로 새로 열리는 데이터는 없고, 어느 팀 것을 보여줄지는
앱이 접속 주소의 팀으로 건다. **배포 전후 언제 적용해도 안전하다**(옛 코드도 팀 조건을 직접 건다).

```sql
-- 확인: 네 정책 모두 (del_yn = false)
select tablename, policyname, roles::text, qual from pg_policies
where schemaname = 'public' and tablename in ('gthr_mst', 'sch_post_mst') and cmd = 'SELECT' order by 1, 2;
```

### 14. `20261109230000_comp_admin_policy_any_team.sql`

대회 원본(`comp_mst`)·종목(`comp_evt_cfg`) 관리자 쓰기 정책이 기강 팀 id 로 고정돼 있던 것을 "어느 팀이든 owner·admin" 으로
바꾼다(대회 원본은 공용, 아무 팀 관리자나 고칠 수 있다). 앱의 대회 쓰기는 service_role 이라 화면 동작은 그대로다 —
**배포 전후 언제 적용해도 안전하다.**

```sql
-- 확인: 두 정책 모두 기강 id 가 없다(false)
select policyname, (coalesce(qual, '') || coalesce(with_check, '')) like '%c0ffee00%' as still_hardcoded
from pg_policies where schemaname = 'public'
  and policyname in ('comp_mst_mutate_team_admin', 'comp_evt_cfg_mutate_team_admin');
```

## 배포

1. 위 1~9·12가 끝났는지 표에서 확인한다(10·11·13·14는 배포 뒤여도 된다).
2. PR #649 머지 → dev → main 배포.
3. 배포 후 확인
   - 기강 모임을 하나 만들거나 "단톡방에 알림"으로 카톡이 기강 방에 오는지
   - 알림 화면·알림 설정 토글이 되는지
   - 관리자 화면에서 이름 한 번 바꿔 보고 이력에 행위자가 찍히는지:
     ```sql
     select tbl_nm, chg_tp_cd, actor_src_cd, actor_mem_id, actor_team_id, chg_cols_json, crt_at
     from chg_hist order by crt_at desc limit 5;
     ```
   - 1번과 배포 사이에 옛 코드가 남긴 발송 이력이 있으면 팀을 채운다:
     ```sql
     update kakao_send_hist set team_id = 'c0ffee00-0000-4000-8000-000000000001' where team_id is null;
     ```
   - 기강 화면에 모임 계좌(프로젝트 신청·회비 내역)와 채널 4칸(홈 맨 아래·더보기·로그인)이 그대로 보이는지
   - **가입 정보 옮기기 다시**(8번과 배포 사이 공백 메우기 — 여러 번 돌려도 안전):
     ```sql
     insert into team_mem_onbd_rel (team_id, mem_id, join_purp_cds, join_purp_txt, join_src_cd, join_src_txt, attd_pldg_at, pldg_gthr_id, crt_at, upd_at)
     select 'c0ffee00-0000-4000-8000-000000000001', p.mem_id, coalesce(p.join_purp_cds, '{}'), p.join_purp_txt,
            p.join_src_cd, p.join_src_txt, p.attd_pldg_at, p.pldg_gthr_id, p.crt_at, p.upd_at
     from mem_onbd_prf p
     where exists (select 1 from team_mem_rel r where r.mem_id = p.mem_id
                   and r.team_id = 'c0ffee00-0000-4000-8000-000000000001' and r.vers = 0 and r.del_yn = false)
     on conflict (team_id, mem_id) do update
       set join_purp_cds = excluded.join_purp_cds, join_purp_txt = excluded.join_purp_txt,
           join_src_cd = excluded.join_src_cd, join_src_txt = excluded.join_src_txt,
           attd_pldg_at = excluded.attd_pldg_at, pldg_gthr_id = excluded.pldg_gthr_id
       where team_mem_onbd_rel.upd_at < excluded.upd_at;
     ```

## 배포 후 정리 (급하지 않음)

- 운영·dev Vercel 환경변수 `KAKAO_ROOM_ID`·`KAKAO_ROOM` 삭제 — 더 이상 읽지 않는다(남아 있어도 무시된다).
- 10번(기강 오픈채팅 비밀번호 행)을 넣은 뒤: `lib/team-social.ts` 의 기강 전환 분기와 `lib/env.ts` 의
  `KAKAO_CHAT_PASSWORD`, Vercel 환경변수 `KAKAO_CHAT_PASSWORD` 를 지운다.
- 가입 정보 옮기기를 다시 돌린 뒤(위) `mem_onbd_prf` 의 옛 칸 6개(`join_purp_cds`·`join_purp_txt`·`join_src_cd`·
  `join_src_txt`·`attd_pldg_at`·`pldg_gthr_id`)를 지우는 마이그레이션을 따로 낸다. 남아 있는 동안은 다른 팀 관리자가
  두 팀 소속자의 옛 가입 경로를 볼 수 있다(`mem_onbd_prf_select_team_admin` — 지금은 해당자 1명).
- 이펙트를 다 옮긴 뒤 `effect_mst` 의 `rarity_level`·`use_yn`·`unlock_cond_json` 은 "팀 행이 없을 때 기본값"으로만 쓰인다.
- 건의 팀 칸의 전환용 기본값을 지운다(새 코드는 늘 팀을 넣는다):
  `alter table fdbk_mst alter column team_id drop default;`
- **울산 주소를 회원들에게 알리는 건** 이 PR 체크리스트(울산 시작 준비 등)가 끝난 뒤.

## 참고

- 행위자 헤더(`x-gg-actor-mem-id` · `x-gg-actor-team-id`)가 Supabase API 게이트웨이를 지나 DB 트리거까지
  전달되는 건 dev 에서 확인했다(2026-11-09 — 임시 함수로 헤더 echo, 확인 후 삭제).
- MCP `apply_migration` 이 "declined" 로 거절되면 `.mcp.json` 의 `skip_elicitations` 설정을 본다(로컬 설정, 저장소 밖).
