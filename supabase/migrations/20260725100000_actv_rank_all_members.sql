-- 기강 활동량 랭킹 — 상위 10명 제한 해제 (전원)
--
-- 배경: 활동량 존이 "순위 나열 목록"에서 "점수에 비례하는 아바타 무더기"로 바뀐다.
-- 크기로 격차를 보여주는 그림이라 상위 10명만으로는 성립하지 않는다 — 큰 얼굴 몇 개만
-- 남고 "이만큼 많은 사람이 뛰었다"는 밀도가 사라진다. 이번 달 점수가 있는 사람은 전부 싣는다.
--
-- 변경은 actv_rank CTE의 `LIMIT 10` 제거 **한 곳뿐**이다. 나머지 CTE·SELECT는
-- 20260722110000에서 그대로 가져왔다(CREATE OR REPLACE라 전체 본문을 다시 써야 한다).
--
-- 상한을 아예 두지 않는 이유: `HAVING sum(pt.pt_amt) > 0`가 이미 자연 상한이다. 활동한
-- 사람만 들어오고 팀 규모(수십~수백)를 넘지 않는다. 크루가 커져 화면이 감당 못 하면 그때는
-- SQL이 아니라 **화면이** 자를 문제다 — 여기서 자르면 "전부"라는 사실 자체가 사라진다.

CREATE OR REPLACE FUNCTION public.get_team_story_feed(p_team_id uuid, p_mem_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d),
week_start AS (
  SELECT (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS w
),
newbies AS (
  SELECT tm.mem_id, tm.team_mem_id, mm.mem_nm, mm.avatar_url, tm.join_dt,
         COALESCE(tm.selected_badge_effect, 'none')   AS badge_effect,
         COALESCE(tm.selected_frame_cd, 'frame-none') AS frame_cd,
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
  LEFT JOIN public.comp_evt_cfg ce ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
  WHERE rr.vers = 0 AND rr.del_yn = false
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
actv_rank AS (
  -- LIMIT 없음: 이번 달 활동량이 있는 팀원 전부. 아바타 무더기가 밀도로 읽히려면 전원이어야 한다.
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
  ORDER BY actv_score DESC
),
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
  SELECT rr.race_result_id::text AS rec_id
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false, week_start
  WHERE rr.vers = 0 AND rr.del_yn = false AND rr.crt_at >= week_start.w
  UNION ALL
  SELECT eth.act_id::text AS rec_id
  FROM public.evt_mlg_act_hist eth
  INNER JOIN public.evt_team_prt_rel etpr ON etpr.prt_id = eth.prt_id
  INNER JOIN public.evt_team_mst etm ON etm.evt_id = etpr.evt_id AND etm.team_id = p_team_id
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = etpr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false, week_start
  WHERE (eth.act_dt AT TIME ZONE 'Asia/Seoul') >= week_start.w
),
week_stat AS (
  SELECT (SELECT count(*) FROM week_gthr) AS gthr_cnt,
         (SELECT count(*) FROM week_attd) AS attd_cnt,
         (SELECT count(*) FROM week_recs) AS rec_cnt
),
recent_pledges AS (
  SELECT p.pldg_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.pldg_txt, p.crt_at
  FROM public.pldg_mst p
  INNER JOIN public.mem_mst mm ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
  WHERE p.team_id = p_team_id AND p.del_yn = false
  ORDER BY p.crt_at DESC LIMIT 8
),
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
      'race_dt',rc.race_dt,
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
    FROM week_stat ws),
  'pledges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'pldg_id',p.pldg_id,'mem_id',p.mem_id,'mem_nm',p.mem_nm,'avatar_url',p.avatar_url,
      'pldg_txt',p.pldg_txt,'crt_at',p.crt_at) ORDER BY p.crt_at DESC)
    FROM recent_pledges p), '[]'::jsonb)
);
$function$;
