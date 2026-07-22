SET lock_timeout = '3s';

-- 프로필 카드 RPC v4
--   ① running_profile에 near_stn_nm(가까운 역) 추가 — 신규 가입자는 기록이 없어 카드가 비는데,
--      온보딩에서 받은 러닝 프로필·가까운 역은 있으므로 이걸로 카드를 채운다.
--   ② recent_actv 배열 추가 — 최근 90일 활동 이력(대회/모임)을 카드에서 펼쳐볼 수 있게.
--      대회는 제목·기록, 모임은 제목·날짜·인원. 딥링크는 안 건다(목록만 보여주는 용도).
--
-- v3 대비 변경만 담았고 나머지 CTE·슬레이트·칭호 정렬은 그대로다.

CREATE OR REPLACE FUNCTION public.get_public_member_card(p_mem_id uuid, p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
WITH me AS (
  SELECT tm.team_mem_id, tm.mem_id, tm.join_dt, tm.intro_txt,
         m.mem_nm, m.avatar_url,
         tm.selected_badge_effect, tm.selected_frame_cd
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst m
    ON m.mem_id = tm.mem_id AND m.vers = 0 AND m.del_yn = false
  WHERE tm.team_id = p_team_id AND tm.mem_id = p_mem_id
    AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active'
),
back_no AS (
  SELECT rn FROM (
    SELECT tm.mem_id,
           rank() OVER (ORDER BY tm.join_dt NULLS LAST, tm.mem_id) AS rn
    FROM public.team_mem_rel tm
    WHERE tm.team_id = p_team_id AND tm.vers = 0
  ) t
  WHERE t.mem_id = p_mem_id
),
slate AS (
  SELECT * FROM (VALUES
    ('road_run','FULL', 1),
    ('road_run','HALF', 2),
    ('road_run','10K',  3)
  ) AS s(sport, evt, ord)
),
best_road AS (
  SELECT DISTINCT ON (s.ord)
         s.ord, c.comp_sprt_cd AS sport, ce.comp_evt_type AS evt,
         rr.rec_time_sec, rr.race_nm, rr.race_dt
  FROM public.rec_race_hist rr
  INNER JOIN public.comp_mst c
    ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
  INNER JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
  INNER JOIN slate s
    ON s.sport = c.comp_sprt_cd AND s.evt = upper(ce.comp_evt_type)
  WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
  ORDER BY s.ord, rr.rec_time_sec ASC
),
best_other AS (
  SELECT DISTINCT ON (c.comp_sprt_cd)
         CASE c.comp_sprt_cd WHEN 'triathlon' THEN 10 ELSE 11 END AS ord,
         c.comp_sprt_cd AS sport,
         COALESCE(ce.comp_evt_type, '') AS evt,
         rr.rec_time_sec, rr.race_nm, rr.race_dt
  FROM public.rec_race_hist rr
  INNER JOIN public.comp_mst c
    ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
   AND c.comp_sprt_cd IN ('triathlon','cycling')
  LEFT JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
  WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
  ORDER BY c.comp_sprt_cd, rr.rec_time_sec ASC
),
best AS (
  SELECT ord, sport, evt, rec_time_sec, race_nm, race_dt FROM best_road
  UNION ALL
  SELECT ord, sport, evt, rec_time_sec, race_nm, race_dt FROM best_other
),
titles AS (
  SELECT t.ttl_nm, t.ttl_desc, t.desc_visibility, t.rarity_level, t.ttl_ctgr_cd,
         mt.is_prmy_yn, mt.grnt_at
  FROM public.mem_ttl_rel mt
  INNER JOIN public.ttl_mst t
    ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
  INNER JOIN me ON me.team_mem_id = mt.team_mem_id
  WHERE mt.vers = 0 AND mt.del_yn = false
    AND (mt.exp_at IS NULL OR mt.exp_at > now())
),
upcoming AS (
  SELECT c.comp_id, c.short_id, c.comp_nm, c.stt_dt
  FROM public.comp_reg_rel cr
  INNER JOIN public.team_comp_plan_rel tcp
    ON tcp.team_comp_id = cr.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
   AND tcp.team_id = p_team_id
  INNER JOIN public.comp_mst c
    ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  WHERE cr.mem_id = p_mem_id AND cr.vers = 0 AND cr.del_yn = false
    AND c.stt_dt >= (now() AT TIME ZONE 'Asia/Seoul')::date
  ORDER BY c.stt_dt ASC
  LIMIT 1
),
-- 최근 활동일 — 모임 참석·대회 기록 중 가장 최근. 활동 컨디션(표정) 판정용
last_actv AS (
  SELECT max(d) AS last_dt FROM (
    SELECT max(gm.stt_at AT TIME ZONE 'Asia/Seoul')::date AS d
    FROM public.gthr_attd_rel ga
    INNER JOIN public.gthr_mst gm
      ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
    WHERE ga.mem_id = p_mem_id AND gm.stt_at < now()
    UNION ALL
    SELECT max(rr.race_dt) FROM public.rec_race_hist rr
    WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
  ) x
),
-- 최근 90일 활동 이력 — 카드에서 펼쳐보는 목록.
--   대회: 제목 + 기록(초).  모임: 제목 + 날짜 + 참석 인원.
--   인원은 해당 모임의 전체 참석자 수(본인 포함).
recent_actv AS (
  SELECT kind, actv_dt, title, rec_time_sec, attd_cnt
  FROM (
    SELECT 'race'::text          AS kind,
           rr.race_dt            AS actv_dt,
           COALESCE(rr.race_nm, c.comp_nm, '대회') AS title,
           rr.rec_time_sec       AS rec_time_sec,
           NULL::bigint          AS attd_cnt
    FROM public.rec_race_hist rr
    LEFT JOIN public.comp_mst c
      ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
    WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
      AND rr.race_dt >= (now() AT TIME ZONE 'Asia/Seoul')::date - 90
    UNION ALL
    SELECT 'gathering'::text,
           (gm.stt_at AT TIME ZONE 'Asia/Seoul')::date,
           gm.gthr_nm,
           NULL::integer,
           (SELECT count(*) FROM public.gthr_attd_rel g2 WHERE g2.gthr_id = gm.gthr_id)
    FROM public.gthr_attd_rel ga
    INNER JOIN public.gthr_mst gm
      ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
    WHERE ga.mem_id = p_mem_id
      AND gm.stt_at < now()
      AND gm.stt_at >= now() - interval '90 days'
  ) u
  ORDER BY actv_dt DESC
),
stats AS (
  SELECT
    (SELECT count(*) FROM public.gthr_attd_rel ga
       INNER JOIN public.gthr_mst gm
         ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
      WHERE ga.mem_id = p_mem_id
        AND gm.stt_at < now())                                  AS gthr_attd_cnt,
    (SELECT count(*) FROM public.comp_reg_rel cr
       INNER JOIN public.team_comp_plan_rel tcp
         ON tcp.team_comp_id = cr.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
        AND tcp.team_id = p_team_id
       INNER JOIN public.comp_mst c
         ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
      WHERE cr.mem_id = p_mem_id AND cr.vers = 0 AND cr.del_yn = false
        AND COALESCE(c.end_dt, c.stt_dt) < (now() AT TIME ZONE 'Asia/Seoul')::date) AS comp_reg_cnt,
    (SELECT COALESCE(sum(pt.pt_amt), 0) FROM public.pt_txn_hist pt
      WHERE pt.mem_id = p_mem_id AND pt.team_id = p_team_id)     AS activity_score,
    (SELECT count(*) FROM public.gthr_attd_rel ga
       INNER JOIN public.gthr_mst gm
         ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
      WHERE ga.mem_id = p_mem_id
        AND gm.stt_at < now()
        AND gm.stt_at >= now() - interval '90 days')             AS recent_gthr_cnt,
    (SELECT count(*) FROM public.rec_race_hist rr
      WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
        AND rr.race_dt >= (now() AT TIME ZONE 'Asia/Seoul')::date - 90) AS recent_race_cnt
)
SELECT jsonb_build_object(
  'mem_nm',        me.mem_nm,
  'avatar_url',    me.avatar_url,
  'badge_effect',  COALESCE(me.selected_badge_effect, 'none'),
  'frame_cd',      COALESCE(me.selected_frame_cd, 'frame-none'),
  'intro_txt',     me.intro_txt,
  'join_dt',       me.join_dt,
  'back_no',       (SELECT rn FROM back_no),
  'utmb_index',    (SELECT up.utmb_idx FROM public.mem_utmb_prf up
                     WHERE up.mem_id = p_mem_id AND up.vers = 0 AND up.del_yn = false
                     LIMIT 1),
  'upcoming_race', (SELECT jsonb_build_object(
                             'comp_id', u.comp_id,
                             'short_id', u.short_id,
                             'comp_nm', u.comp_nm,
                             'stt_dt', u.stt_dt)
                      FROM upcoming u),
  -- 러닝 프로필 — 가까운 역 포함. 셋 중 하나라도 있으면 내려준다(신규 가입자 카드 채우기용).
  'running_profile', (SELECT jsonb_build_object(
                               'avg_pace_cd', op.avg_pace_cd,
                               'avg_run_dist_km', op.avg_run_dist_km,
                               'near_stn_nm', op.near_stn_nm,
                               -- 목적: 코드 칩 + 본인이 직접 쓴 한마디.
                               -- 한마디가 있으면 화면에서 칩 대신 그 문장을 쓴다(getMemberIntro).
                               'join_purp_cds', to_jsonb(COALESCE(op.join_purp_cds, ARRAY[]::varchar[])),
                               'join_purp_txt', op.join_purp_txt)
                        FROM public.mem_onbd_prf op
                       WHERE op.mem_id = p_mem_id
                         AND (op.avg_pace_cd IS NOT NULL
                              OR op.avg_run_dist_km IS NOT NULL
                              OR op.near_stn_nm IS NOT NULL
                              OR array_length(op.join_purp_cds, 1) > 0
                              OR btrim(COALESCE(op.join_purp_txt, '')) <> '')),
  'last_actv_dt',  (SELECT last_dt FROM last_actv),
  'recent_actv',   COALESCE((SELECT jsonb_agg(jsonb_build_object(
                               'kind', r.kind,
                               'actv_dt', r.actv_dt,
                               'title', r.title,
                               'rec_time_sec', r.rec_time_sec,
                               'attd_cnt', r.attd_cnt)
                             ORDER BY r.actv_dt DESC)
                            FROM recent_actv r), '[]'::jsonb),
  'primary_title', (SELECT jsonb_build_object(
                             'ttl_nm', t.ttl_nm,
                             'ttl_desc', t.ttl_desc,
                             'desc_visibility', t.desc_visibility)
                      FROM titles t WHERE t.is_prmy_yn LIMIT 1),
  'titles',        COALESCE((SELECT jsonb_agg(jsonb_build_object(
                               'ttl_nm', t.ttl_nm,
                               'ttl_desc', t.ttl_desc,
                               'desc_visibility', t.desc_visibility,
                               'rarity_level', t.rarity_level,
                               'ttl_ctgr_cd', t.ttl_ctgr_cd)
                             ORDER BY t.grnt_at DESC NULLS LAST, t.rarity_level DESC)
                            FROM titles t), '[]'::jsonb),
  'best_records',  COALESCE((SELECT jsonb_agg(jsonb_build_object(
                               'sport', b.sport,
                               'evt', b.evt,
                               'rec_time_sec', b.rec_time_sec,
                               'race_nm', b.race_nm,
                               'race_dt', b.race_dt)
                            ORDER BY b.ord)
                     FROM best b), '[]'::jsonb),
  'stats',         (SELECT jsonb_build_object(
                             'gthr_attd_cnt', s.gthr_attd_cnt,
                             'comp_reg_cnt',  s.comp_reg_cnt,
                             'activity_score', s.activity_score,
                             'recent_actv_cnt', s.recent_gthr_cnt + s.recent_race_cnt)
                      FROM stats s)
)
FROM me;
$function$;

COMMENT ON FUNCTION public.get_public_member_card(uuid, uuid) IS
  '멤버 프로필 카드(쇼케이스) 공개 프로젝션. 기록은 로드 FULL/HALF/10K + 철인 + 사이클 슬레이트만(트레일·울트라는 UTMB 인덱스로 갈음). running_profile에 가까운 역 포함, recent_actv는 최근 90일 활동 이력. 반환 null = 카드 없음.';

REVOKE ALL ON FUNCTION public.get_public_member_card(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_member_card(uuid, uuid) TO anon, authenticated, service_role;
