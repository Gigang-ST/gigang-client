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
| 8 | 울산 시작 준비(배치 팀별 유일 조건·가입 정보 팀별·셀프 가입 active 고정 — 울산 배치·칭호는 안 만든다) | `20261109180000_team_start_ready.sql` | ✅ | ☐ |
| 9 | 팀 설정 나머지(이펙트 팀별·회비 분류 팀 칸·기강 계좌/채널 등록) | `20261109190000_team_settings.sql` | ✅ | ☐ |
| 10 | 기강 오픈채팅 비밀번호를 팀 설정에 등록 | (아래 SQL — 사람이 직접) | ☐ | ☐ |
| 11 | 캐시 무효화 웹훅에 팀 싣기 | `20261109200000_revalidate_webhook_team.sql` | ✅ | ☐ |
| 12 | 건의 팀별 | `20261109210000_fdbk_team.sql` | ✅ | ☐ |
| 13 | 모임·일정 읽기 — 로그인한 비회원도 비로그인과 같게 | `20261109220000_gthr_sch_post_select_authenticated_public.sql` | ✅ | ☐ |
| 14 | 대회 원본·종목 관리자 정책에서 기강 id 고정 걷기 | `20261109230000_comp_admin_policy_any_team.sql` | ✅ | ☐ |
| 15 | 기강 워드마크·정기 모임 템플릿을 팀 설정에 등록 | `20261109240000_team_cfg_wordmark_regular_template.sql` | ✅ | ☐ |
| 16 | 기강 가입 폼에 「울산지부 가입이세요?」 안내 | `20261109250000_team_cfg_signup_other_teams.sql` | ✅ | ☐ |
| 17 | 울산 회비 끄기(팀 설정) | `20261109260000_ulsan_dues_off.sql` | ✅ | ☐ |
| 18 | 팀 설정 `project.show_intro` 걷기(프로젝트 없을 때 소개 화면 제거) | `20261109270000_drop_project_show_intro.sql` | ✅ | ☐ |
| 19 | 알림 유형 `team_cfg_chg`(owner 전용 설정 변경 알림) | `20261110100000_noti_type_team_cfg_chg.sql` | ✅ | ☐ |
| 20 | **배포 뒤** 전환용 장치 걷기(알림 설정 옛 유니크·기본값, 카톡 이력 팀 NOT NULL, 건의 기본값) | `20261110110000_after_deploy_cleanup.sql` | ✅ | ☐ |
| 21 | 슬로건·창설일을 팀 설정에 등록(기강 + 울산) — **배포 전** | `20261110105000_team_cfg_slogan_founded.sql` | ✅ | ☐ |
| 22 | 칭호 기능 켜고 끄기(`team_feature_on` 함수·카드 함수 칭호 거르기·울산 끔) | `20261110106000_feature_titles.sql` | ✅ | ☐ |
| 23 | 울산 전당 종목 = 트레일러닝만(`records.categories`) | `20261110107000_ulsan_records_trail.sql` | ✅ | ☐ |

바깥 설정(이미 끝남): Vercel 도메인 `ulsan.gigang.team`(운영) · `dev.ulsan.gigang.team`(dev),
Supabase Redirect URLs `https://ulsan.gigang.team/auth/callback`(prd) · dev 두 줄.

## 시작 전 — 되돌릴 준비 (필수)

이 묶음엔 **되돌리기 어려운 변경**이 있다: 포인트 함수 옛 시그니처 DROP(7), 공개 조회 함수 본문 덮어쓰기(6·8·11),
유니크 제약 교체(3·8·20), 정책 교체(5·13·14). 마이그레이션 파일만으로는 이전 상태로 못 돌린다.

1. **백업을 확인한다** — Supabase 대시보드 → Database → Backups 에서 오늘 날짜 백업이 있는지 본다
   (없거나 PITR 이 꺼져 있으면 아래 2로 최소한 함수·정책 정의라도 떠 둔다).
2. **바뀔 함수·정책 정의를 떠 둔다**(문제가 생기면 이 결과를 그대로 실행해 되돌린다):
   ```sql
   select p.proname, pg_get_functiondef(p.oid)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'get_public_member_card','get_team_story_feed','get_public_team_competitions','get_public_team_gatherings',
     'get_public_team_sch_posts','get_schedule_paged','revalidate_records','v2_rls_auth_in_team',
     'v2_rls_auth_team_owner_or_admin','pt_earn','pt_revoke','pt_earn_mlg_record','pt_revoke_mlg_record',
     'pt_earn_post_record','pt_trg_rec_race_hist','pt_net_mlg_record','pt_post_record_mlg_auto_cnt','pt_post_record_amt_for');
   select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;
   ```
3. **사전 점검** — 이름이 다르면 `DROP ... IF EXISTS` 가 조용히 건너뛰고 뒤 INSERT 가 실패한다:
   ```sql
   select conname from pg_constraint where conrelid = 'public.batch_job_mst'::regclass and contype = 'u'; -- batch_job_mst_job_cd_key
   select count(*) from (select mem_id, noti_type_enm from noti_pref_cfg group by 1, 2 having count(*) > 1) x;  -- 0
   ```
   (2026-11-10 prd 확인: 배치 유니크 이름 일치 · 알림 설정 중복 0)

## 배포 전 (prd SQL Editor 또는 MCP)

순서대로 한다. 각 단계 끝의 확인 쿼리가 기대값이 아니면 멈춘다.

### 1. `20261109120000_team_cfg.sql`

파일 내용을 그대로 실행한다. 옛 코드와 함께 돌아도 안전하다(옛 코드는 이 테이블을 모른다).
발송 이력의 팀 칸엔 기본값(기강)을 둔다 — 배포 전 옛 코드가 남기는 행도 팀이 채워진다. 기본값 제거·NOT NULL 은 20번(배포 뒤).

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
배포 뒤에는 기강 owner 가 관리자 → 팀 설정 → 「카톡 공지방 ID」에서 바꿀 수 있다(owner 만 — 바뀌면 다른 운영진에게 알림).

**⛔ 배포 직전 필수 확인 — 0행이면 배포하지 않는다.** 방이 없는 것과 "안 쓰는 팀"은 코드가 구분하지 못한다
(방 미설정은 일부러 끈 것으로 보고 이력도 남기지 않는다). 기강 방이 빠진 채 나가면 모임 개설·변경·**취소** 공지가 조용히 끊긴다.
```sql
select count(*) from team_cfg
where team_id = 'c0ffee00-0000-4000-8000-000000000001' and cfg_cd = 'kakao.room_id' and vers = 0 and del_yn = false; -- 1
```

### 3. `20261109130000_noti_pref_cfg_team.sql`

**두 단계 중 첫 단계**(2026-11-10 정정). 옛 유니크 `(mem_id, noti_type_enm)` 은 **남기고** 새 유니크
`(team_id, mem_id, noti_type_enm)` 만 더하며, 팀 칸엔 기본값(기강)을 둔다 — 옛 코드(`onConflict: "mem_id,noti_type_enm"`, 팀 없이)와
새 코드가 둘 다 돈다. 옛 유니크·기본값 제거는 20번(배포 뒤). 그 사이엔 한 사람이 두 팀에서 같은 알림을 따로 못 끄지만,
울산 회원이 생기기 전이라 문제없다.

```sql
-- 확인
select (select count(*) from noti_pref_cfg where team_id is null) as null_team, -- 0
       (select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint
         where conrelid = 'public.noti_pref_cfg'::regclass and contype = 'u') as uniq; -- 옛 UNIQUE (mem_id, noti_type_enm) | 새 UNIQUE (team_id, mem_id, noti_type_enm)
```

### 4. `20261109140000_chg_hist.sql`

옛 코드와 함께 돌아도 안전하다(이력만 쌓이고, 행위자 헤더가 없으면 "누가"가 비어 남는다).
이력 기록이 실패해도 원래 수정·삭제는 막지 않는다(경고만 남긴다 — 2026-11-10).
회원 정보에서 값 대신 「가림」으로 남기는 칸은 계좌번호·생일·이메일·로그인 연결이다. **이름·전화번호·은행명은 바뀐 값이 그대로 남는다**
("누가 언제 무엇으로 바꿨나"를 남기려는 이력 — 2026-11-10 유저 결정). 이력은 지우지 않고 보관한다.

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
⚠️ `gatherings = 0` 은 **13번 적용 전에만** 맞다. 13번(로그인한 비회원도 공개 모임을 본다) 뒤에 다시 돌리면 0이 아니게 나오는데,
그건 의도된 동작이다(오탐). 13번 뒤 재확인할 땐 `own_rel = 1` 만 본다.

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

- 배치 유일 조건을 `(job_cd, team_id)` 로 바꾼다. **울산엔 배치·칭호를 만들지 않는다**(2026-11-10 결정) — 회비 끔,
  마일리지런은 기강 전용, 칭호 0개라 칭호 배치도 할 일이 없다. 울산이 칭호를 만들면 그때 그 팀 배치 행만 넣는다.
- 새 테이블 `team_mem_onbd_rel`(팀별 가입 목적·유입 경로·첫 모임 약속)을 만들고 기강 값을 옮긴다.
  회원 카드·기강이야기 함수의 가입 목적을 새 테이블에서 읽게 바꾼다(함수별로 다 바꾼 뒤 한 번에 다시 만든다).
- 셀프 가입 정책에 `mem_st_cd = 'active'` 를 더한다.

⚠️ **배포 전 옛 코드는 가입 정보를 옛 칸(`mem_onbd_prf`)에만 쓴다.** 8번 적용과 배포 사이에 가입한 사람·
러닝 프로필을 고친 사람의 가입 목적은 새 테이블에 없을 수 있다 → 배포 뒤 아래 "옮기기 다시"를 한 번 더 돌린다.

```sql
-- 확인
select (select count(*) from batch_job_mst) as jobs,                        -- 4 (기강만)
       (select count(*) from ttl_mst t join team_mst m using (team_id) where m.team_cd = 'ulsan' and t.vers = 0) as ulsan_titles, -- 0
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
- 울산은 `project.show_intro = false` — ⚠️ 이 키는 18번에서 걷어낸다(소개 화면 자체를 없앴다). 9번 다음에 18번이 이 행을 내린다.
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

> ⚠️ **전환 분기를 지우기 전까지는 비워도 안 사라진다.** 팀 설정 화면에서 이 값을 비우면(되돌리기) 안내 문구
> 「비우면 비밀번호 안내가 안 보여요」와 달리 **환경변수의 예전 비밀번호가 다시 보인다.** 이 행을 넣은 뒤
> 「배포 후 정리」의 전환 분기·환경변수 삭제까지 끝내야 문구와 동작이 맞는다.

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

### 15. `20261109240000_team_cfg_wordmark_regular_template.sql` — ⚠️ 빠지면 배포 순간 기강 공유 카드 글자·정기 모임 자동 채움이 사라진다

코드에 박혀 있던 기강 워드마크(`GIGANG`)와 정기 모임 템플릿(제목·19:30·비고)을 기강 팀 설정 행으로 옮긴다. 두 키 모두 기본값이
없어서(다른 팀에 기강 값이 새지 않게) **행 없이 새 코드가 나가면** 기강 모임 공유 카드에서 `GIGANG` 이 빠지고, 정기 모임을 골라도
자동으로 채워지지 않는다. 옛 코드와 함께 돌아도 안전하다(옛 코드는 이 행을 안 읽는다) — **배포 전에 넣는다.**
울산 값은 울산 운영진이 정하면 같은 INSERT 로 넣는다.

```sql
-- 확인: 기강 두 행
select cfg_cd, left(cfg_val_json::text, 40) from team_cfg c join team_mst t using (team_id)
where t.team_cd = 'gigang' and c.cfg_cd in ('brand.wordmark', 'gathering.regular_template') and c.vers = 0 and c.del_yn = false;
```

### 16. `20261109250000_team_cfg_signup_other_teams.sql`

기강 가입 폼 첫 화면에 「울산지부 가입이세요? 여기로 →」를 띄우는 팀 설정 행. 없으면 안내가 안 뜰 뿐이라
**배포 전후 언제 넣어도 안전하다.**

```sql
-- 확인: [{"name": "울산지부", "team_cd": "ulsan"}]
select cfg_val_json from team_cfg c join team_mst t using (team_id)
where t.team_cd = 'gigang' and c.cfg_cd = 'signup.other_teams' and c.vers = 0 and c.del_yn = false;
```

### 17. `20261109260000_ulsan_dues_off.sql`

울산 팀 설정 `feature.dues = false`(회비 내역·미납 점·관리자 회비 메뉴·대시보드 카드 숨김). 울산 회비 배치는 8번에서 아예 안 만든다.
행이 없으면 기본값(켬)이라 울산에 회비 메뉴가 보일 뿐 깨지진 않는다 — **배포 전후 언제 넣어도 안전하다**(울산 오픈 전엔 넣는다).

```sql
-- 확인: 울산 dues_cfg = false, dues_batch = null(행 없음) / 기강은 dues_cfg 없음(켬), dues_batch = true
select t.team_cd,
  (select cfg_val_json::text from team_cfg c where c.team_id = t.team_id and c.cfg_cd = 'feature.dues' and c.vers = 0) as dues_cfg,
  (select use_yn from batch_job_mst b where b.team_id = t.team_id and b.job_cd = 'DUES_EXEMPTION_BATCH') as dues_batch
from team_mst t order by 1;
```

### 18. `20261109270000_drop_project_show_intro.sql`

진행 중인 프로젝트가 없을 때 마일리지런 소개를 띄울지 정하던 키를 걷는다 — 이제 모든 팀(기강 포함)이 "진행 중인 프로젝트가 없어요"만
본다(마일리지런은 기강 전용 ADR-0007, 프로젝트는 할 때 만든다). 새 코드는 이 키를 안 읽고 옛 코드는 행이 없으면 기본값(소개 보임)이라
**배포 전후 언제 넣어도 안전하다.**

```sql
-- 확인: vers=0 행이 del_yn = true (vers 1 은 이력)
select t.team_cd, c.vers, c.del_yn from team_cfg c join team_mst t using (team_id) where c.cfg_cd = 'project.show_intro' order by 1, 2;
```

### 19. `20261110100000_noti_type_team_cfg_chg.sql`

알림 유형 목록에 `team_cfg_chg` 를 더한다(owner 전용 설정 — 모임 계좌·카톡 공지방 — 이 바뀌면 그 팀 owner·관리자에게 알림).
옛 코드는 이 유형을 안 쓰므로 언제 적용해도 안전하다. 목록은 2026-11-10 prd 와 같은 것에 하나를 더한 것이다.

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'noti_mst_noti_type_enm_check'; -- 끝에 'team_cfg_chg'
```

### 21. `20261110105000_team_cfg_slogan_founded.sql` — ⚠️ 빠지면 배포 순간 기강 일정 탭 헤더 가운데가 빈다

일정 탭 헤더 가운데 「Since 2024.04.23 / No time to be weak」와 모임 공유 이미지 맨 위 슬로건이 코드에 박혀 있던 걸 팀 설정
(`brand.slogan` · `brand.founded_dt`)으로 옮긴다. 울산 값도 같이 넣는다 — 창설일 2026-11-28, 슬로건 `Climb hard, run wild`
(임시 문구, 울산 운영진이 팀 설정 화면에서 바꾼다). 두 키 모두 기본값이 없어 **행 없이 새 코드가 나가면** 기강 헤더 가운데가 비고
공유 카드 슬로건이 빠진다. 옛 코드는 이 행을 안 읽어 **배포 전에 넣는다.** 파일 시각이 20번보다 앞이지만 번호는 나중에 더해서 21이다.

```sql
-- 확인: 네 행 — 기강 2024-04-23 / No time to be weak, 울산 2026-11-28 / Climb hard, run wild
select t.team_cd, c.cfg_cd, c.cfg_val_json from team_cfg c join team_mst t using (team_id)
where c.cfg_cd in ('brand.slogan', 'brand.founded_dt') and c.vers = 0 and c.del_yn = false order by 1, 2;
```

### 22. `20261110106000_feature_titles.sql`

칭호 기능 켜고 끄기(`feature.titles`, 기본 켬). ① DB 함수 `team_feature_on(팀, 키, 기본값)` 을 만들고(일반 역할 실행 권한 없음),
② 카드 함수 `get_public_member_card` 가 칭호를 끈 팀이면 칭호·대표 칭호·이펙트·프레임을 안 싣게 **지금 정의에서 세 곳만 바꿔** 다시
만든다(바꿀 곳을 정확히 한 번씩 못 찾으면 에러로 멈춘다 — 그때는 6번 적용 여부부터 본다), ③ 울산 `feature.titles = false`.
옛 코드는 이 설정을 안 읽고, 기강은 행이 없어 켬이라 **배포 전후 언제 넣어도 안전하다**(6번 뒤여야 한다).

```sql
-- 확인: 기강 titles_on = true · 칭호 수 그대로, 울산 titles_on = false
select t.team_cd, public.team_feature_on(t.team_id, 'feature.titles', true) as titles_on,
  (select count(*) from mem_ttl_rel r join team_mem_rel m using (team_mem_id) where m.team_id = t.team_id and r.vers = 0 and r.del_yn = false) as held
from team_mst t order by 1;
select position('feature.titles' in pg_get_functiondef('public.get_public_member_card(uuid, uuid)'::regprocedure)) > 0; -- true
```

### 23. `20261110107000_ulsan_records_trail.sql`

울산 랭킹탭(기강의 전당)에 트레일러닝만 세운다 — 종목이 하나라 맨 위 종목 탭 줄 없이 트레일러닝 판만 보인다. 기강은 행이 없어
기본값(넷 다)이다. 행이 없으면 넷 다 보일 뿐이라 **배포 전후 언제 넣어도 안전하다.**

```sql
-- 확인: 울산 ["trail"], 기강 행 없음
select t.team_cd, c.cfg_val_json from team_mst t
left join team_cfg c on c.team_id = t.team_id and c.cfg_cd = 'records.categories' and c.vers = 0 and c.del_yn = false order by 1;
```

## 배포

1. 위 1~9·12·15·19·21이 끝났는지 표에서 확인하고, **2번의 배포 직전 필수 확인(기강 카톡방 1행)**을 다시 돌린다
   (10·11·13·14·16·17·18은 배포 뒤여도 된다).
2. PR #649 머지 → dev → main 배포.
3. 배포 후 확인
   - 기강 모임을 하나 만들거나 "단톡방에 알림"으로 카톡이 기강 방에 오는지
   - 알림 화면·알림 설정 토글이 되는지
   - 관리자 화면에서 이름 한 번 바꿔 보고 이력에 행위자가 찍히는지:
     ```sql
     select tbl_nm, chg_tp_cd, actor_src_cd, actor_mem_id, actor_team_id, chg_cols_json, crt_at
     from chg_hist order by crt_at desc limit 5;
     ```
   - **20번 `20261110110000_after_deploy_cleanup.sql` 을 배포 직후 적용한다** — 알림 설정 옛 유니크·기본값 제거,
     발송 이력 빈 팀 백필 + NOT NULL, 건의 기본값 제거. **배포 전에 적용하면** 옛 코드의 알림 설정 저장·건의 제출이 실패한다.
     ```sql
     -- 확인
     select (select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint
              where conrelid = 'public.noti_pref_cfg'::regclass and contype = 'u') as noti_uniq,          -- 새 유니크 하나만
            (select is_nullable from information_schema.columns
              where table_name = 'kakao_send_hist' and column_name = 'team_id') as kakao_team_nullable, -- NO
            (select column_default from information_schema.columns
              where table_name = 'fdbk_mst' and column_name = 'team_id') as fdbk_default;                -- null
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

- **울산 owner 지정** — prd 울산엔 owner·admin 이 아무도 없다(2026-11-10 확인). 모임 계좌·카톡 공지방은 owner 만
  바꿀 수 있고 owner 는 화면에서 못 정하므로, 첫 owner 는 그 사람이 울산에 가입한 뒤 SQL 로 세운다
  (역할 변경은 이력 함수로 — 직접 UPDATE 하면 변경 이력 버전이 안 남는다):
  ```sql
  select public.apply_team_mem_rel_change(r.team_mem_id, '{"team_role_cd":"owner"}'::jsonb, now())
  from team_mem_rel r
  where r.team_id = 'c0ffee00-0000-4000-8000-000000000002' and r.mem_id = '<울산 owner mem_id>'
    and r.vers = 0 and r.del_yn = false;
  ```
  그 뒤 admin 은 owner 가 관리자 화면에서 지정한다.
- 운영·dev Vercel 환경변수 `KAKAO_ROOM_ID`·`KAKAO_ROOM` 삭제 — 더 이상 읽지 않는다(남아 있어도 무시된다).
- 10번(기강 오픈채팅 비밀번호 행)을 넣은 뒤: `lib/team-social.ts` 의 기강 전환 분기와 `lib/env.ts` 의
  `KAKAO_CHAT_PASSWORD`, Vercel 환경변수 `KAKAO_CHAT_PASSWORD` 를 지운다.
- 가입 정보 옮기기를 다시 돌린 뒤(위) `mem_onbd_prf` 의 옛 칸 6개(`join_purp_cds`·`join_purp_txt`·`join_src_cd`·
  `join_src_txt`·`attd_pldg_at`·`pldg_gthr_id`)를 지우는 마이그레이션을 따로 낸다. 남아 있는 동안은 다른 팀 관리자가
  두 팀 소속자의 옛 가입 경로를 볼 수 있다(`mem_onbd_prf_select_team_admin` — 지금은 해당자 1명).
- 이펙트를 다 옮긴 뒤 `effect_mst` 의 `rarity_level`·`use_yn`·`unlock_cond_json` 은 "팀 행이 없을 때 기본값"으로만 쓰인다.
- (건의·알림 설정·발송 이력의 전환용 기본값 제거는 20번 마이그레이션으로 옮겼다 — 위 「배포」 3.)
- ⚠️ **탈퇴자 개인정보 파기 기능을 만들 때** 변경 이력(`chg_hist`, `tbl_nm = 'mem_mst'`)에 남은 **이름·전화번호·은행명 값도 같이 지운다.**
  이력은 기간 없이 보관하고 그 칸들은 가리지 않으므로, 회원 정보만 지우면 이력에 옛 값이 남는다(첫 파기 기한 2027-07-16).
- **울산 주소를 회원들에게 알리는 건** 이 PR 체크리스트(울산 시작 준비 등)가 끝난 뒤.

## 참고

- 행위자 헤더(`x-gg-actor-mem-id` · `x-gg-actor-team-id`)가 Supabase API 게이트웨이를 지나 DB 트리거까지
  전달되는 건 dev 에서 확인했다(2026-11-09 — 임시 함수로 헤더 echo, 확인 후 삭제).
- MCP `apply_migration` 이 "declined" 로 거절되면 `.mcp.json` 의 `skip_elicitations` 설정을 본다(로컬 설정, 저장소 밖).
