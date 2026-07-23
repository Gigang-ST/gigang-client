-- 전광판 묶음 B — ① 응원 무한 카운트 ② 신규멤버 간단 카드 payload ③ 활동량 월 집계
-- 설계서: docs/superpowers/specs/2026-07-23-전광판-응원-간단카드-활동량-design.md
SET lock_timeout = '3s';

-- ─────────────────────────────────────────────
-- ① 리액션 카운트 — 1인 1행 유지, 행 안에서 카운트가 오른다
-- ─────────────────────────────────────────────
-- 유니크 제약(team_id, entity_type, entity_id, mem_id)을 그대로 두는 이유:
-- 행을 여러 개 쌓는 설계는 감사성이 같으면서 테이블만 무한히 커지고, 1인 상한을
-- 강제하려면 별도 집계가 필요하다. 한 행에 카운트를 누적하면 상한이 CHECK로 걸린다.
ALTER TABLE public.rctn_mst
  ADD COLUMN IF NOT EXISTS rctn_cnt integer NOT NULL DEFAULT 1;

ALTER TABLE public.rctn_mst
  DROP CONSTRAINT IF EXISTS ck_rctn_mst_rctn_cnt;
ALTER TABLE public.rctn_mst
  ADD CONSTRAINT ck_rctn_mst_rctn_cnt CHECK (rctn_cnt BETWEEN 1 AND 99);

COMMENT ON COLUMN public.rctn_mst.rctn_cnt IS
  '이 멤버가 이 항목에 누른 횟수(1~99). 항목 총합은 sum(rctn_cnt). 취소는 없다 — 카운트업 전용';

COMMENT ON TABLE public.rctn_mst IS
  '전광판 리액션(범용). 1인 1행이되 rctn_cnt로 무한 카운트업(상한 99). 기강 포인트 적립 대상 아님.';

-- ─────────────────────────────────────────────
-- ② 원자적 증가 RPC
-- ─────────────────────────────────────────────
-- 읽고-쓰기 왕복으로 증가시키면 동시 연타에서 증분이 유실된다.
-- ON CONFLICT DO UPDATE 한 문장으로 처리하고, 상한은 LEAST로 잘라 CHECK 위반 대신
-- 조용히 멈추게 한다(연타 중 에러 토스트가 뜨는 게 더 나쁘다).
CREATE OR REPLACE FUNCTION public.bump_story_rctn(
  p_team_id     uuid,
  p_entity_type text,
  p_entity_id   text,
  p_mem_id      uuid,
  p_rctn_cd     text,
  p_delta       integer
)
RETURNS integer
LANGUAGE sql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.rctn_mst (team_id, entity_type, entity_id, mem_id, rctn_cd, rctn_cnt)
  VALUES (p_team_id, p_entity_type, p_entity_id, p_mem_id, p_rctn_cd,
          LEAST(GREATEST(p_delta, 1), 99))
  ON CONFLICT (team_id, entity_type, entity_id, mem_id)
  DO UPDATE SET rctn_cnt = LEAST(public.rctn_mst.rctn_cnt + EXCLUDED.rctn_cnt, 99),
                rctn_cd  = EXCLUDED.rctn_cd
  RETURNING rctn_cnt;
$function$;

COMMENT ON FUNCTION public.bump_story_rctn(uuid, text, text, uuid, text, integer) IS
  '전광판 리액션 카운트업. 갱신 후 이 멤버의 누적 횟수를 반환한다. 상한 99에서 포화(에러 아님). 서버 액션(admin 클라이언트)에서만 호출.';

-- 호출자는 서버 액션의 admin 클라이언트뿐이다 — anon/authenticated에 직접 열지 않는다.
REVOKE ALL ON FUNCTION public.bump_story_rctn(uuid, text, text, uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.bump_story_rctn(uuid, text, text, uuid, text, integer) TO service_role;

-- ─────────────────────────────────────────────
-- ③ get_team_story_feed v3
-- ─────────────────────────────────────────────
-- v2(20260723100100) 대비 변경점만:
--   · rctn 집계 count(*) → sum(rctn_cnt), 내 누적 횟수(my_cnt) 추가
--   · newbies에 간단 프로필 카드 payload(칭호·프레임·한마디·러닝 프로필) 추가
--   · actv_rank 전체 누적 → 이번 달(aply_dt 기준, KST) 집계
CREATE OR REPLACE FUNCTION public.get_team_story_feed(
  p_team_id uuid,
  p_mem_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d),
week_start AS (
  -- Postgres date_trunc('week', ...)는 월요일 시작 — 요구사항(이번 주 = 월요일 시작)과 일치.
  -- 서울 벽시계로 자른 뒤 다시 timestamptz로 되돌려 timestamptz 컬럼과 정확히 비교한다.
  SELECT (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS w
),
newbies AS (
  SELECT tm.mem_id, tm.team_mem_id, mm.mem_nm, mm.avatar_url, tm.join_dt,
         COALESCE(tm.selected_badge_effect, 'none')       AS badge_effect,
         COALESCE(tm.selected_frame_cd, 'frame-none')     AS frame_cd,
         tm.intro_txt
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE tm.team_id = p_team_id AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active' AND tm.join_dt >= today.d - 30
  ORDER BY tm.join_dt DESC LIMIT 6
),
recent_recs AS (
  SELECT rr.race_result_id, rr.mem_id, mm.mem_nm, mm.avatar_url,
         c.comp_sprt_cd AS sport, COALESCE(ce.comp_evt_type, '') AS evt,
         rr.rec_time_sec, rr.race_nm, rr.race_dt
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = rr.mem_id AND mm.vers = 0 AND mm.del_yn = false
  INNER JOIN public.comp_mst c ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false, today
  WHERE rr.vers = 0 AND rr.del_yn = false AND rr.race_dt >= today.d - 90
  ORDER BY rr.race_dt DESC, rr.upd_at DESC LIMIT 10
),
upcoming AS (
  SELECT c.comp_id, c.short_id, c.comp_nm, c.stt_dt,
         count(DISTINCT cr.mem_id) AS reg_cnt,
         jsonb_agg(DISTINCT jsonb_build_object('mem_id', mm.mem_id, 'mem_nm', mm.mem_nm, 'avatar_url', mm.avatar_url)) AS runners
  FROM public.team_comp_plan_rel tcp
  INNER JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  INNER JOIN public.comp_reg_rel cr ON cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = cr.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false
    AND c.stt_dt >= today.d AND c.stt_dt <= today.d + 60
  GROUP BY c.comp_id, c.short_id, c.comp_nm, c.stt_dt
  ORDER BY c.stt_dt ASC LIMIT 4
),
month_rank AS (
  SELECT mm.mem_id, mm.mem_nm, mm.avatar_url, count(*) AS attd_cnt,
         row_number() OVER (ORDER BY count(*) DESC, mm.mem_nm) AS rn
  FROM public.gthr_attd_rel ga
  INNER JOIN public.gthr_mst gm ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
  INNER JOIN public.mem_mst mm ON mm.mem_id = ga.mem_id AND mm.vers = 0 AND mm.del_yn = false
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = ga.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  WHERE gm.stt_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
    AND gm.stt_at < now()
  GROUP BY mm.mem_id, mm.mem_nm, mm.avatar_url
  ORDER BY attd_cnt DESC LIMIT 5
),
-- 기강 활동량 랭킹 — 이번 달(aply_dt 기준, KST) 합산. 매달 1일에 0부터 다시 시작한다.
-- `aply_dt <= 오늘` 필터는 필수: 대회 포인트는 **개최일**에 귀속되므로, 없으면
-- 11월 대회를 신청한 사람이 7월 랭킹에 미리 잡힌다(설계서 §"유저-노출 집계" 규칙).
actv_rank AS (
  SELECT mm.mem_id, mm.mem_nm, mm.avatar_url, sum(pt.pt_amt)::integer AS actv_score,
         row_number() OVER (ORDER BY sum(pt.pt_amt) DESC, mm.mem_nm) AS rn
  FROM public.pt_txn_hist pt
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = pt.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = pt.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE pt.team_id = p_team_id
    AND pt.aply_dt >= date_trunc('month', today.d)::date
    AND pt.aply_dt <= today.d
  GROUP BY mm.mem_id, mm.mem_nm, mm.avatar_url
  HAVING sum(pt.pt_amt) > 0
  ORDER BY actv_score DESC LIMIT 10
),
-- 이번 주(KST, 월요일 시작 ~ now) 크루 합계 — 모임 수 / 연인원 참석 수 / 이번 주 등록된 대회 기록 수.
week_gthr AS (
  SELECT gm.gthr_id
  FROM public.gthr_mst gm, week_start
  WHERE gm.team_id = p_team_id AND gm.del_yn = false
    AND gm.stt_at >= week_start.w AND gm.stt_at < now()
),
week_attd AS (
  SELECT ga.mem_id
  FROM public.gthr_attd_rel ga
  INNER JOIN week_gthr wg ON wg.gthr_id = ga.gthr_id
),
week_recs AS (
  SELECT rr.race_result_id
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false, week_start
  WHERE rr.vers = 0 AND rr.del_yn = false AND rr.crt_at >= week_start.w
),
week_stat AS (
  SELECT (SELECT count(*) FROM week_gthr) AS gthr_cnt,
         (SELECT count(*) FROM week_attd) AS attd_cnt,
         (SELECT count(*) FROM week_recs) AS rec_cnt
),
-- 총합은 행 수가 아니라 rctn_cnt 합계다. my_cnt는 내가 이 항목에 누른 누적 횟수(상한 표시용).
rctn AS (
  SELECT entity_type, entity_id, sum(rctn_cnt)::integer AS cnt,
         max(CASE WHEN p_mem_id IS NOT NULL AND mem_id = p_mem_id THEN rctn_cd END) AS my_rctn,
         COALESCE(max(CASE WHEN p_mem_id IS NOT NULL AND mem_id = p_mem_id THEN rctn_cnt END), 0)::integer AS my_cnt
  FROM public.rctn_mst WHERE team_id = p_team_id GROUP BY entity_type, entity_id
)
SELECT jsonb_build_object(
  'newbies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','newbie','entity_id',n.mem_id::text,'event_at',n.join_dt,
      'mem_id',n.mem_id,'mem_nm',n.mem_nm,'avatar_url',n.avatar_url,
      -- 간단 프로필 카드용 — MemberCardCompactData와 1:1
      'badge_effect',n.badge_effect,'frame_cd',n.frame_cd,'intro_txt',n.intro_txt,
      'primary_title',(SELECT jsonb_build_object(
                         'ttl_nm',t.ttl_nm,'ttl_desc',t.ttl_desc,'desc_visibility',t.desc_visibility)
                       FROM public.mem_ttl_rel mt
                       INNER JOIN public.ttl_mst t
                         ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
                       WHERE mt.team_mem_id = n.team_mem_id AND mt.vers = 0 AND mt.del_yn = false
                         AND (mt.exp_at IS NULL OR mt.exp_at > now()) AND mt.is_prmy_yn
                       LIMIT 1),
      'running_profile',(SELECT jsonb_build_object(
                           'avg_pace_cd',op.avg_pace_cd,'avg_run_dist_km',op.avg_run_dist_km,
                           'near_stn_nm',op.near_stn_nm,
                           'join_purp_cds',COALESCE(op.join_purp_cds,'{}'::text[]),
                           'join_purp_txt',op.join_purp_txt)
                         FROM public.mem_onbd_prf op WHERE op.mem_id = n.mem_id),
      'rctn_cd','welcome','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY n.join_dt DESC)
    FROM newbies n LEFT JOIN rctn r ON r.entity_type='newbie' AND r.entity_id=n.mem_id::text), '[]'::jsonb),
  'records', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','record','entity_id',rc.race_result_id::text,'event_at',rc.race_dt,
      'mem_id',rc.mem_id,'mem_nm',rc.mem_nm,'avatar_url',rc.avatar_url,
      'sport',rc.sport,'evt',rc.evt,'rec_time_sec',rc.rec_time_sec,'race_nm',rc.race_nm,
      'rctn_cd','fire','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY rc.race_dt DESC)
    FROM recent_recs rc LEFT JOIN rctn r ON r.entity_type='record' AND r.entity_id=rc.race_result_id::text), '[]'::jsonb),
  'races', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','race','entity_id',u.comp_id::text,'event_at',u.stt_dt,
      'comp_id',u.comp_id,'short_id',u.short_id,'comp_nm',u.comp_nm,'stt_dt',u.stt_dt,
      'reg_cnt',u.reg_cnt,'runners',u.runners,
      'rctn_cd','cheer','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY u.stt_dt ASC)
    FROM upcoming u LEFT JOIN rctn r ON r.entity_type='race' AND r.entity_id=u.comp_id::text), '[]'::jsonb),
  'month_rank', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rank',mr.rn,'mem_id',mr.mem_id,'mem_nm',mr.mem_nm,'avatar_url',mr.avatar_url,'attd_cnt',mr.attd_cnt) ORDER BY mr.rn)
    FROM month_rank mr), '[]'::jsonb),
  'actv_rank', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rank',ar.rn,'mem_id',ar.mem_id,'mem_nm',ar.mem_nm,'avatar_url',ar.avatar_url,'actv_score',ar.actv_score) ORDER BY ar.rn)
    FROM actv_rank ar), '[]'::jsonb),
  'week_stat', (SELECT jsonb_build_object(
      'gthr_cnt', ws.gthr_cnt, 'attd_cnt', ws.attd_cnt, 'rec_cnt', ws.rec_cnt)
    FROM week_stat ws)
);
$function$;

COMMENT ON FUNCTION public.get_team_story_feed(uuid, uuid) IS
  '기강 전광판 피드 — 신규가입(간단 프로필 카드 payload 포함)·최근기록·다가오는대회·이달의참가왕(month_rank)·기강활동량랭킹(actv_rank, 이번 달 aply_dt 기준)·이번주통계(week_stat) + 리액션 카운트(sum(rctn_cnt)). p_mem_id가 있으면 내 리액션과 내 누적 횟수를 함께 내린다. 반환 키에 point/pt 문자열을 쓰지 않는다. 주/월 경계는 KST(Asia/Seoul) 기준.';

REVOKE ALL ON FUNCTION public.get_team_story_feed(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_story_feed(uuid, uuid) TO anon, authenticated, service_role;
