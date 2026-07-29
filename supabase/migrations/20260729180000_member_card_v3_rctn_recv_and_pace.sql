-- 프로필 카드 v3 — 받은 응원 총합 + 페이스 추이용 기록 배열
--
-- ① rctn_recv_cnt : 이 멤버가 "받은" 응원 총합.
--    rctn_mst는 (팀 × 항목 × 누른사람) 1행이라, 받은 쪽 집계는 entity가 누구 것인지로 되짚어야 한다.
--      · actv   — entity_id = mem_id (활동지수·목표 한마디 슬롯이 공유하는 멤버 기준 카운터)
--      · newbie — entity_id = mem_id (새 얼굴 슬롯의 환영)
--      · record — entity_id = rec_race_hist.race_result_id (본인 대회 기록에 달린 것)
--      · post   — entity_id = post_mst.post_id (본인 깅스타그램 글에 달린 것)
--    **race(cheer)는 제외한다** — 그건 대회에 달리는 응원이지 사람이 받은 게 아니다.
--    같은 대회 출전자 전원이 같은 수치를 나눠 갖게 되어 개인 지표로 성립하지 않는다.
--    화면에서는 종류를 나누지 않고 하나의 🔥 숫자로 합쳐 보여준다(환영·대박을 갈라 두 숫자를
--    세우면 상단 계기 자리가 좁고, 신입만 👏가 붙어 항목이 사람마다 들쭉날쭉해진다).
--
-- ② race_records : 페이스 추이 그래프용 로드런 기록 전체(시간순).
--    기존 best_records는 종목당 1건(최고기록)이라 추이를 그릴 수 없다. 카드 팝업에서도
--    페이스 추이를 보여주기로 하면서 배열을 얹었다.
--    `best_road`와 같은 범위(comp_sprt_cd='road_run' + FULL/HALF/10K)로 좁힌다 —
--    PaceChart의 DISTANCE_KM이 로드 거리를 전제하므로 트레일·울트라가 끼면 페이스가 거짓이 된다.
--    race_dt NULL은 제외한다(차트가 날짜 문자열로 정렬·필터한다).
--
-- 나머지 본문은 v2와 동일(pg_get_functiondef 실측 정의를 그대로 옮기고 위 둘만 얹음).
-- dev/prd 함수 정의가 md5까지 동일함을 확인한 뒤 작성했다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_public_member_card(p_mem_id uuid, p_team_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
-- 페이스 추이용 로드런 기록 전체(최고기록 1건이 아니라 이력 전부).
-- 범위는 best_road와 동일하게 road_run + FULL/HALF/10K로 좁힌다.
pace_recs AS (
  SELECT upper(ce.comp_evt_type)                    AS evt,
         rr.rec_time_sec,
         COALESCE(rr.race_nm, c.comp_nm, '대회')    AS race_nm,
         rr.race_dt
  FROM public.rec_race_hist rr
  INNER JOIN public.comp_mst c
    ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
   AND c.comp_sprt_cd = 'road_run'
  INNER JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
  WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
    AND upper(ce.comp_evt_type) IN ('FULL','HALF','10K')
    AND rr.race_dt IS NOT NULL
),
-- 받은 응원 총합. 세 갈래를 UNION ALL로 나눠 각각 (team_id, entity_type) 인덱스 접두를
-- 타게 한다 — OR 하나로 묶으면 ix_rctn_mst_entity를 못 쓰고 전체를 훑는다.
rctn_recv AS (
  SELECT COALESCE(sum(t.cnt), 0)::bigint AS cnt FROM (
    SELECT sum(r.rctn_cnt) AS cnt
    FROM public.rctn_mst r
    WHERE r.team_id = p_team_id
      AND r.entity_type IN ('actv','newbie')
      AND r.entity_id = p_mem_id::text
    UNION ALL
    SELECT sum(r.rctn_cnt)
    FROM public.rctn_mst r
    INNER JOIN public.rec_race_hist rr
      ON rr.race_result_id::text = r.entity_id
     AND rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
    WHERE r.team_id = p_team_id AND r.entity_type = 'record'
    UNION ALL
    SELECT sum(r.rctn_cnt)
    FROM public.rctn_mst r
    INNER JOIN public.post_mst pm
      ON pm.post_id::text = r.entity_id
     AND pm.mem_id = p_mem_id AND pm.del_yn = false
    WHERE r.team_id = p_team_id AND r.entity_type = 'post'
  ) t
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
  'running_profile', (SELECT jsonb_build_object(
                               'avg_pace_cd', op.avg_pace_cd,
                               'avg_run_dist_km', op.avg_run_dist_km,
                               'near_stn_nm', op.near_stn_nm,
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
  'race_records',  COALESCE((SELECT jsonb_agg(jsonb_build_object(
                               'evt', pr.evt,
                               'rec_time_sec', pr.rec_time_sec,
                               'race_nm', pr.race_nm,
                               'race_dt', pr.race_dt)
                             ORDER BY pr.race_dt)
                            FROM pace_recs pr), '[]'::jsonb),
  'rctn_recv_cnt', (SELECT cnt FROM rctn_recv),
  'stats',         (SELECT jsonb_build_object(
                             'gthr_attd_cnt', s.gthr_attd_cnt,
                             'comp_reg_cnt',  s.comp_reg_cnt,
                             'activity_score', s.activity_score,
                             'recent_actv_cnt', s.recent_gthr_cnt + s.recent_race_cnt)
                      FROM stats s)
)
FROM me;
$function$;

-- 새 시그니처가 아니라 CREATE OR REPLACE라 GRANT는 유지되지만,
-- PostgREST 스키마 캐시가 옛 정의를 붙잡고 있으면 앱에서만 필드가 안 보인다(KNOWLEDGE §PostgREST 캐시).
NOTIFY pgrst, 'reload schema';
