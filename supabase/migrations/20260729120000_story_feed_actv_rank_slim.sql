-- 활동지수(actv_rank) payload 슬림화 — 안 쓰는 필드 제거 + 프로필 부품은 상위 3명만
--
-- 배경(QS-15): 이 배열은 이번 달 활동량이 있는 크루원 **전원**(dev 68명)을 담는다. 68행 자체는
-- 필요하다 — 아래 활동량 무더기(ActvPile)가 전원을 원으로 그리기 때문. 문제는 그 68행이
-- 저마다 **한 명분만 쓰이는 프로필 부품**을 이고 온다는 것이다. 리드 "이번 달 기강 잡는"
-- 슬롯은 상위 3명 중 **랜덤 1명**만 세우고, 그 1명도 칭호·소개·이번달 수치만 그린다.
--
-- 게다가 셋은 **아무도 안 그린다**:
--   · best_records   — 원래 이 슬롯에 개인 최고기록을 얹으려고 20260726120000에서 넣었는데,
--                      "이번 달 이야기에 역대 이야기가 끼어든다"는 이유로 화면에서 걷어냈다
--                      (story-lede.tsx §PB 블록). 쿼리만 남아 계속 계산되고 있었다.
--   · running_profile — 이 슬롯의 parts는 ["title","intro"]뿐이라 러닝프로필을 요청하지 않는다.
--                      (새 얼굴 슬롯은 쓴다 — newbies 쪽은 손대지 않는다.)
--   · frame_cd       — PersonProfile이 렌더하는 코드가 없다(타입에만 있었다).
--
-- **전송량보다 DB 시간이 더 아프다**(dev EXPLAIN ANALYZE 실측): best_records만 떼어 재보니
-- 전원 68명 16.9ms vs 상위 3명 1.4ms — 차이 약 15.5ms다. 피드 전체가 45ms인데 그 3분의 1을
-- 아무도 안 보는 필드에 쓰고 있었다. 멤버당 상관 서브쿼리라 크루가 커지면 선형으로 늘어난다.
-- primary_title·intro_txt·badge_effect·mth_* 도 모두 행마다 도는 서브쿼리라 함께 줄어든다.
--
-- **상위 3명은 고정 규칙이다**(사용자 결정 2026-07-29): 리드 대표 추첨이 상위 3명에서 바뀌지
-- 않는다. 클라의 `pickActvLeadIndex`(cap = Math.min(3, …))와 아래 `ar.rn <= 3`이 같은 3을
-- 가리킨다 — 한쪽만 바꾸면 부품이 빈 사람이 대표로 서서 칭호·소개가 통째로 사라지므로,
-- 바꿀 일이 생기면 **반드시 양쪽을 함께** 고친다.
--
-- 키를 `null`로 채우지 않고 **CASE로 통째로 빼는** 이유: null로 두면 키 이름 몫(행당 ~110B)이
-- 그대로 남는다. CASE는 조건이 거짓이면 THEN 안의 스칼라 서브쿼리를 평가조차 하지 않아
-- 전송량과 실행시간이 함께 준다.
--
-- 나머지 존(newbies·records·races·pledges·week_stat)은 **한 글자도 바꾸지 않았다**.
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
  SELECT rr.race_result_id, rr.mem_id, tm.team_mem_id, mm.mem_nm, mm.avatar_url,
         c.comp_sprt_cd AS sport, COALESCE(ce.comp_evt_type, '') AS evt,
         rr.rec_time_sec, rr.race_nm, rr.race_dt, rr.comp_id, c.short_id,
         COALESCE(tm.selected_badge_effect, 'none')   AS badge_effect,
         COALESCE(tm.selected_frame_cd, 'frame-none') AS frame_cd
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = rr.mem_id AND mm.vers = 0 AND mm.del_yn = false
  INNER JOIN public.comp_mst c ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false, today
  WHERE rr.vers = 0 AND rr.del_yn = false
    AND rr.race_dt >= today.d - 30 AND rr.race_dt <= today.d
  ORDER BY rr.race_dt DESC, rr.upd_at DESC LIMIT 6
),
upcoming AS (
  SELECT c.comp_id, c.short_id, c.comp_nm, c.stt_dt,
         count(DISTINCT cr.mem_id) AS reg_cnt,
         (SELECT jsonb_agg(jsonb_build_object(
                   'mem_id', r.mem_id, 'mem_nm', r.mem_nm, 'avatar_url', r.avatar_url, 'evt', r.evt)
                 ORDER BY r.evt, r.mem_nm)
          FROM (
            SELECT DISTINCT mm2.mem_id, mm2.mem_nm, mm2.avatar_url,
                   COALESCE(ce.comp_evt_type, '') AS evt
            FROM public.comp_reg_rel cr2
            INNER JOIN public.mem_mst mm2 ON mm2.mem_id = cr2.mem_id AND mm2.vers = 0 AND mm2.del_yn = false
            LEFT JOIN public.comp_evt_cfg ce ON ce.comp_evt_id = cr2.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
            WHERE cr2.team_comp_id = tcp.team_comp_id AND cr2.vers = 0 AND cr2.del_yn = false
              AND cr2.prt_role_cd = 'participant'
          ) r
         ) AS runners
  FROM public.team_comp_plan_rel tcp
  INNER JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  INNER JOIN public.comp_reg_rel cr ON cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = cr.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false
    AND c.stt_dt >= today.d AND c.stt_dt <= today.d + 60
  GROUP BY c.comp_id, c.short_id, c.comp_nm, c.stt_dt, tcp.team_comp_id
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
  SELECT mm.mem_id, tm.team_mem_id, mm.mem_nm, mm.avatar_url, sum(pt.pt_amt)::integer AS actv_score,
         row_number() OVER (ORDER BY sum(pt.pt_amt) DESC, mm.mem_nm) AS rn
  FROM public.pt_txn_hist pt
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = pt.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = pt.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE pt.team_id = p_team_id
    AND pt.aply_dt >= date_trunc('month', today.d)::date
    AND pt.aply_dt <= today.d
  GROUP BY mm.mem_id, tm.team_mem_id, mm.mem_nm, mm.avatar_url
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
  SELECT p.pldg_id, p.mem_id, tm.team_mem_id, mm.mem_nm, mm.avatar_url, p.pldg_txt, p.crt_at,
         COALESCE(tm.selected_badge_effect, 'none')   AS badge_effect,
         COALESCE(tm.selected_frame_cd, 'frame-none') AS frame_cd,
         tm.intro_txt
  FROM public.pldg_mst p
  INNER JOIN public.mem_mst mm ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
  LEFT JOIN public.team_mem_rel tm ON tm.mem_id = p.mem_id AND tm.team_id = p.team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
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
      'race_dt',rc.race_dt,'comp_id',rc.comp_id,'short_id',rc.short_id,
      'badge_effect',rc.badge_effect,'frame_cd',rc.frame_cd,
      'primary_title',(SELECT jsonb_build_object(
                         'ttl_nm',t.ttl_nm,'ttl_desc',t.ttl_desc,'desc_visibility',t.desc_visibility)
                       FROM public.mem_ttl_rel mt
                       INNER JOIN public.ttl_mst t
                         ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
                       WHERE mt.team_mem_id = rc.team_mem_id AND mt.vers = 0 AND mt.del_yn = false
                         AND (mt.exp_at IS NULL OR mt.exp_at > now()) AND mt.is_prmy_yn
                       LIMIT 1),
      'rctn_cd','fire','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY rc.race_dt DESC)
    FROM recent_recs rc LEFT JOIN rctn r ON r.entity_type='record' AND r.entity_id=rc.race_result_id::text), '[]'::jsonb),
  'races', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','race','entity_id',u.comp_id::text,'event_at',u.stt_dt,
      'comp_id',u.comp_id,'short_id',u.short_id,'comp_nm',u.comp_nm,'stt_dt',u.stt_dt,
      'reg_cnt',u.reg_cnt,'runners',COALESCE(u.runners, '[]'::jsonb),
      'rctn_cd','cheer','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY u.stt_dt ASC)
    FROM upcoming u LEFT JOIN rctn r ON r.entity_type='race' AND r.entity_id=u.comp_id::text), '[]'::jsonb),
  'month_rank', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rank',mr.rn,'mem_id',mr.mem_id,'mem_nm',mr.mem_nm,'avatar_url',mr.avatar_url,'attd_cnt',mr.attd_cnt) ORDER BY mr.rn)
    FROM month_rank mr), '[]'::jsonb),
  -- ▼ 여기만 바뀌었다 — 전원에겐 무더기가 쓰는 것만, 프로필 부품은 상위 3명에만(§파일 상단)
  'actv_rank', COALESCE((SELECT jsonb_agg(
      jsonb_build_object(
        'rank',ar.rn,'mem_id',ar.mem_id,'mem_nm',ar.mem_nm,'avatar_url',ar.avatar_url,
        'actv_score',ar.actv_score)
      || CASE WHEN ar.rn <= 3 THEN jsonb_build_object(
           'badge_effect', COALESCE((SELECT tm2.selected_badge_effect FROM public.team_mem_rel tm2
                                     WHERE tm2.team_mem_id = ar.team_mem_id), 'none'),
           'intro_txt',    (SELECT tm2.intro_txt FROM public.team_mem_rel tm2
                                     WHERE tm2.team_mem_id = ar.team_mem_id),
           'primary_title',(SELECT jsonb_build_object(
                              'ttl_nm',t.ttl_nm,'ttl_desc',t.ttl_desc,'desc_visibility',t.desc_visibility)
                            FROM public.mem_ttl_rel mt
                            INNER JOIN public.ttl_mst t
                              ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
                            WHERE mt.team_mem_id = ar.team_mem_id AND mt.vers = 0 AND mt.del_yn = false
                              AND (mt.exp_at IS NULL OR mt.exp_at > now()) AND mt.is_prmy_yn
                            LIMIT 1),
           'mth_attd_cnt', (SELECT count(*) FROM public.gthr_attd_rel ga
                            INNER JOIN public.gthr_mst gm ON gm.gthr_id = ga.gthr_id
                              AND gm.del_yn = false AND gm.team_id = p_team_id
                            WHERE ga.mem_id = ar.mem_id
                              AND gm.stt_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
                              AND gm.stt_at < now()),
           'mth_rec_cnt', (
             (SELECT count(*) FROM public.rec_race_hist rr, today
                WHERE rr.mem_id = ar.mem_id AND rr.vers = 0 AND rr.del_yn = false
                  AND rr.race_dt >= date_trunc('month', today.d)::date AND rr.race_dt <= today.d)
             + (SELECT count(*) FROM public.evt_mlg_act_hist eth
                  INNER JOIN public.evt_team_prt_rel etpr ON etpr.prt_id = eth.prt_id, today
                WHERE etpr.mem_id = ar.mem_id
                  AND eth.act_dt >= date_trunc('month', today.d)::date AND eth.act_dt <= today.d)
             + (SELECT count(*) FROM public.post_mst p, today
                WHERE p.mem_id = ar.mem_id AND p.team_id = p_team_id AND p.del_yn = false
                  AND p.src_enm <> 'mlg_auto'
                  AND p.act_dt >= date_trunc('month', today.d)::date AND p.act_dt <= today.d)
           ))
         ELSE '{}'::jsonb END
      ORDER BY ar.rn)
    FROM actv_rank ar), '[]'::jsonb),
  'week_stat', (SELECT jsonb_build_object(
      'gthr_cnt', ws.gthr_cnt, 'attd_cnt', ws.attd_cnt, 'rec_cnt', ws.rec_cnt)
    FROM week_stat ws),
  'pledges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'pldg_id',p.pldg_id,'mem_id',p.mem_id,'mem_nm',p.mem_nm,'avatar_url',p.avatar_url,
      'pldg_txt',p.pldg_txt,'crt_at',p.crt_at,
      'badge_effect',p.badge_effect,'frame_cd',p.frame_cd,'intro_txt',p.intro_txt,
      'primary_title',(SELECT jsonb_build_object(
                         'ttl_nm',t.ttl_nm,'ttl_desc',t.ttl_desc,'desc_visibility',t.desc_visibility)
                       FROM public.mem_ttl_rel mt
                       INNER JOIN public.ttl_mst t
                         ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
                       WHERE mt.team_mem_id = p.team_mem_id AND mt.vers = 0 AND mt.del_yn = false
                         AND (mt.exp_at IS NULL OR mt.exp_at > now()) AND mt.is_prmy_yn
                       LIMIT 1)) ORDER BY p.crt_at DESC)
    FROM recent_pledges p), '[]'::jsonb)
);
$function$;

NOTIFY pgrst, 'reload schema';
