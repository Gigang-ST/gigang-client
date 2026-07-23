-- get_team_story_feed 주/월 경계 KST 정합성 수정.
--   버그: date_trunc('week'|'month', now() AT TIME ZONE 'Asia/Seoul')는
--   timestamp WITHOUT time zone(서울 벽시계)이라, timestamptz 컬럼(gthr_mst.stt_at,
--   rec_race_hist.crt_at)과 비교할 때 세션 TimeZone(Supabase 기본 UTC)으로 강제
--   변환된다 → 경계가 KST 대비 9시간 밀려 이번 주/달 집계가 어긋난다.
--   수정: 잘라낸 경계값을 다시 `AT TIME ZONE 'Asia/Seoul'`로 timestamptz화한다.
--   (v2 20260722130000 함수 본문과 경계식만 다르고 나머지는 동일 — 로직 변화 없음)
SET lock_timeout = '3s';

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
  SELECT tm.mem_id, mm.mem_nm, mm.avatar_url, tm.join_dt
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
-- 기강활동지수 랭킹 — pt_txn_hist 전체 누적 합산(월 한정 아님. 참가왕이 이미 월 지표라 축을 다르게 가져간다).
-- 팀 소속 active 멤버만 대상으로 하며, 상위 10명까지 내린다(프론트 5명 + 더보기).
actv_rank AS (
  SELECT mm.mem_id, mm.mem_nm, mm.avatar_url, sum(pt.pt_amt)::integer AS actv_score,
         row_number() OVER (ORDER BY sum(pt.pt_amt) DESC, mm.mem_nm) AS rn
  FROM public.pt_txn_hist pt
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = pt.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = pt.mem_id AND mm.vers = 0 AND mm.del_yn = false
  WHERE pt.team_id = p_team_id
  GROUP BY mm.mem_id, mm.mem_nm, mm.avatar_url
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
rctn AS (
  SELECT entity_type, entity_id, count(*) AS cnt,
         max(CASE WHEN p_mem_id IS NOT NULL AND mem_id = p_mem_id THEN rctn_cd END) AS my_rctn
  FROM public.rctn_mst WHERE team_id = p_team_id GROUP BY entity_type, entity_id
)
SELECT jsonb_build_object(
  'newbies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','newbie','entity_id',n.mem_id::text,'event_at',n.join_dt,
      'mem_id',n.mem_id,'mem_nm',n.mem_nm,'avatar_url',n.avatar_url,
      'rctn_cd','welcome','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn) ORDER BY n.join_dt DESC)
    FROM newbies n LEFT JOIN rctn r ON r.entity_type='newbie' AND r.entity_id=n.mem_id::text), '[]'::jsonb),
  'records', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','record','entity_id',rc.race_result_id::text,'event_at',rc.race_dt,
      'mem_id',rc.mem_id,'mem_nm',rc.mem_nm,'avatar_url',rc.avatar_url,
      'sport',rc.sport,'evt',rc.evt,'rec_time_sec',rc.rec_time_sec,'race_nm',rc.race_nm,
      'rctn_cd','fire','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn) ORDER BY rc.race_dt DESC)
    FROM recent_recs rc LEFT JOIN rctn r ON r.entity_type='record' AND r.entity_id=rc.race_result_id::text), '[]'::jsonb),
  'races', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','race','entity_id',u.comp_id::text,'event_at',u.stt_dt,
      'comp_id',u.comp_id,'short_id',u.short_id,'comp_nm',u.comp_nm,'stt_dt',u.stt_dt,
      'reg_cnt',u.reg_cnt,'runners',u.runners,
      'rctn_cd','cheer','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn) ORDER BY u.stt_dt ASC)
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
  '기강 전광판 피드 — 신규가입·최근기록·다가오는대회·이달의참가왕(month_rank)·기강활동지수랭킹(actv_rank)·이번주통계(week_stat) + 리액션 카운트. p_mem_id가 있으면 내 리액션을 함께 내린다. actv_rank는 pt_txn_hist 전체 누적 합산(월 한정 아님), 반환 키에 point/pt 문자열을 쓰지 않는다(기강 포인트는 히든 운영). 주/월 경계는 KST(Asia/Seoul) timestamptz로 정규화.';

REVOKE ALL ON FUNCTION public.get_team_story_feed(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_story_feed(uuid, uuid) TO anon, authenticated, service_role;
