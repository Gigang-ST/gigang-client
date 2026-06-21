-- ============================================================
-- fix_kst_date_boundary
--
-- date를 ::timestamptz로 캐스팅하면 UTC 기준(00:00 UTC)으로 해석되어
-- KST 경계(00:00 KST = 전날 15:00 UTC)가 어긋남.
-- ::timestamp AT TIME ZONE 'Asia/Seoul' 패턴으로 교정.
--
-- 영향 함수:
--   1. get_schedule_paged (gthr_agg CTE + gathering SELECT)
--   2. get_public_team_gatherings (p_start/p_end 경계 비교)
-- ============================================================

-- ── 1. get_schedule_paged 재정의 ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_schedule_paged(
  p_team_id     uuid,
  p_direction   text,
  p_cursor_date date,
  p_mem_id      uuid DEFAULT NULL,
  p_month_limit int  DEFAULT 2
)
RETURNS TABLE (
  item_type  text,
  item_id    uuid,
  item_nm    text,
  post_type  text,
  start_date date,
  end_date   date,
  loc_nm     text,
  url        text,
  cont_txt   text,
  evt_stt_at timestamptz,
  evt_end_at timestamptz,
  crt_by     uuid,
  crt_by_nm  text,
  reg_count  bigint,
  cmnt_count bigint,
  short_id   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
my_regs AS (
  SELECT DISTINCT team_comp_id
  FROM public.comp_reg_rel
  WHERE mem_id = p_mem_id AND vers = 0 AND del_yn = false
),
my_attd AS (
  SELECT DISTINCT gthr_id
  FROM public.gthr_attd_rel
  WHERE mem_id = p_mem_id
),
sch_dates AS (
  SELECT (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date AS event_date
  FROM public.sch_post_mst s
  WHERE s.team_id = p_team_id AND s.del_yn = false
    AND (
      (p_direction = 'prev' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date < p_cursor_date) OR
      (p_direction = 'next' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date > p_cursor_date)
    )
),
comp_dates AS (
  SELECT DISTINCT c.stt_dt AS event_date
  FROM public.team_comp_plan_rel tcp
  JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false
    AND (
      (p_direction = 'prev' AND c.stt_dt < p_cursor_date) OR
      (p_direction = 'next' AND c.stt_dt > p_cursor_date)
    )
    AND (
      EXISTS (SELECT 1 FROM public.comp_reg_rel cr WHERE cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false)
      OR EXISTS (SELECT 1 FROM my_regs mr WHERE mr.team_comp_id = tcp.team_comp_id)
    )
),
gthr_dates AS (
  SELECT (g.stt_at AT TIME ZONE 'Asia/Seoul')::date AS event_date
  FROM public.gthr_mst g
  WHERE g.team_id = p_team_id AND g.del_yn = false
    AND (
      (p_direction = 'prev' AND (g.stt_at AT TIME ZONE 'Asia/Seoul')::date < p_cursor_date) OR
      (p_direction = 'next' AND (g.stt_at AT TIME ZONE 'Asia/Seoul')::date > p_cursor_date)
    )
),
month_candidates AS (
  SELECT DISTINCT DATE_TRUNC('month', event_date)::date AS month_start
  FROM (
    SELECT event_date FROM sch_dates
    UNION SELECT event_date FROM comp_dates
    UNION SELECT event_date FROM gthr_dates
  ) all_dates
),
target_months AS (
  ( SELECT month_start FROM month_candidates WHERE p_direction = 'prev' ORDER BY month_start DESC LIMIT p_month_limit )
  UNION ALL
  ( SELECT month_start FROM month_candidates WHERE p_direction = 'next' ORDER BY month_start ASC  LIMIT p_month_limit )
),
date_range AS (
  SELECT
    MIN(month_start)                                                  AS range_start,
    (MAX(month_start) + interval '1 month' - interval '1 day')::date AS range_end
  FROM target_months
),
-- gthr_agg: ::timestamp AT TIME ZONE 'Asia/Seoul' 로 KST 경계 정확히 계산
gthr_agg AS (
  SELECT
    g.gthr_id,
    COUNT(DISTINCT ar.attd_id) AS attd_count,
    COUNT(DISTINCT cm.cmnt_id) AS cmnt_count
  FROM public.gthr_mst g
  CROSS JOIN date_range
  LEFT JOIN public.gthr_attd_rel ar ON ar.gthr_id = g.gthr_id
  LEFT JOIN public.cmnt_mst cm
    ON cm.entity_type = 'gathering' AND cm.entity_id = g.gthr_id AND cm.del_yn = false
  WHERE g.team_id = p_team_id AND g.del_yn = false
    AND date_range.range_start IS NOT NULL
    AND g.stt_at >= (date_range.range_start::timestamp AT TIME ZONE 'Asia/Seoul')
    AND g.stt_at <  ((date_range.range_end::timestamp + interval '1 day') AT TIME ZONE 'Asia/Seoul')
  GROUP BY g.gthr_id
)

SELECT
  'sch_post'::text                                AS item_type,
  s.sch_post_id                                  AS item_id,
  s.sch_nm                                       AS item_nm,
  s.post_type,
  (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date AS start_date,
  NULL::date                                     AS end_date,
  NULL::text                                     AS loc_nm,
  s.url,
  s.cont_txt,
  s.evt_stt_at,
  s.evt_end_at,
  s.crt_by,
  m.mem_nm                                       AS crt_by_nm,
  NULL::bigint                                   AS reg_count,
  COALESCE((
    SELECT count(*) FROM public.cmnt_mst cm
    WHERE cm.entity_type = 'sch_post' AND cm.entity_id = s.sch_post_id AND cm.del_yn = false
  ), 0)                                          AS cmnt_count,
  s.short_id
FROM public.sch_post_mst s
CROSS JOIN date_range
LEFT JOIN public.mem_mst m ON m.mem_id = s.crt_by
WHERE s.team_id = p_team_id AND s.del_yn = false
  AND date_range.range_start IS NOT NULL
  AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN date_range.range_start AND date_range.range_end

UNION ALL

SELECT
  CASE WHEN mr.team_comp_id IS NOT NULL THEN 'mine' ELSE 'comp' END AS item_type,
  c.comp_id                                                          AS item_id,
  c.comp_nm                                                          AS item_nm,
  NULL::text                                                         AS post_type,
  c.stt_dt                                                           AS start_date,
  c.end_dt                                                           AS end_date,
  c.loc_nm,
  c.src_url                                                          AS url,
  NULL::text                                                         AS cont_txt,
  NULL::timestamptz                                                  AS evt_stt_at,
  NULL::timestamptz                                                  AS evt_end_at,
  NULL::uuid                                                         AS crt_by,
  NULL::text                                                         AS crt_by_nm,
  count(DISTINCT cr.comp_reg_id)                                     AS reg_count,
  COALESCE((
    SELECT count(*) FROM public.cmnt_mst cm
    WHERE cm.entity_type = 'comp' AND cm.entity_id = c.comp_id AND cm.del_yn = false
  ), 0)                                                              AS cmnt_count,
  NULL::text                                                         AS short_id
FROM public.team_comp_plan_rel tcp
JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
CROSS JOIN date_range
LEFT JOIN public.comp_reg_rel cr ON cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
LEFT JOIN my_regs mr ON mr.team_comp_id = tcp.team_comp_id
WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false
  AND date_range.range_start IS NOT NULL
  AND c.stt_dt BETWEEN date_range.range_start AND date_range.range_end
GROUP BY c.comp_id, c.comp_nm, c.stt_dt, c.end_dt, c.loc_nm, c.src_url, mr.team_comp_id
HAVING count(DISTINCT cr.comp_reg_id) > 0 OR mr.team_comp_id IS NOT NULL

UNION ALL

-- gathering: ::timestamp AT TIME ZONE 'Asia/Seoul' 로 KST 경계 정확히 계산
SELECT
  CASE WHEN ma.gthr_id IS NOT NULL THEN 'gathering_mine' ELSE 'gathering' END AS item_type,
  g.gthr_id                                                                    AS item_id,
  g.gthr_nm                                                                    AS item_nm,
  g.gthr_type_enm                                                              AS post_type,
  (g.stt_at AT TIME ZONE 'Asia/Seoul')::date                                  AS start_date,
  NULL::date                                                                   AS end_date,
  g.loc_txt                                                                    AS loc_nm,
  NULL::text                                                                   AS url,
  g.desc_txt                                                                   AS cont_txt,
  g.stt_at                                                                     AS evt_stt_at,
  g.end_at                                                                     AS evt_end_at,
  g.crt_by,
  m.mem_nm                                                                     AS crt_by_nm,
  COALESCE(ga.attd_count, 0)                                                   AS reg_count,
  COALESCE(ga.cmnt_count, 0)                                                   AS cmnt_count,
  g.short_id
FROM public.gthr_mst g
CROSS JOIN date_range
LEFT JOIN public.mem_mst m   ON m.mem_id  = g.crt_by
LEFT JOIN my_attd ma          ON ma.gthr_id = g.gthr_id
LEFT JOIN gthr_agg ga         ON ga.gthr_id = g.gthr_id
WHERE g.team_id = p_team_id AND g.del_yn = false
  AND date_range.range_start IS NOT NULL
  AND g.stt_at >= (date_range.range_start::timestamp AT TIME ZONE 'Asia/Seoul')
  AND g.stt_at <  ((date_range.range_end::timestamp + interval '1 day') AT TIME ZONE 'Asia/Seoul')

ORDER BY start_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_paged(uuid, text, date, uuid, int)
  TO anon, authenticated, service_role;


-- ── 2. get_public_team_gatherings 재정의 (p_start/p_end 경계 교정) ──

CREATE OR REPLACE FUNCTION public.get_public_team_gatherings(
  p_team_id uuid,
  p_start   date DEFAULT NULL,
  p_end     date DEFAULT NULL,
  p_mem_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  gthr_id       uuid,
  short_id      text,
  gthr_nm       text,
  gthr_type_enm text,
  stt_at        timestamptz,
  end_at        timestamptz,
  loc_txt       text,
  desc_txt      text,
  crt_by        uuid,
  crt_by_nm     text,
  attd_count    bigint,
  cmnt_count    bigint,
  is_attending  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.gthr_id,
    g.short_id,
    g.gthr_nm,
    g.gthr_type_enm,
    g.stt_at,
    g.end_at,
    g.loc_txt,
    g.desc_txt,
    g.crt_by,
    m.mem_nm AS crt_by_nm,
    (SELECT COUNT(*) FROM public.gthr_attd_rel ar WHERE ar.gthr_id = g.gthr_id) AS attd_count,
    (SELECT COUNT(*) FROM public.cmnt_mst cm
      WHERE cm.entity_type = 'gathering' AND cm.entity_id = g.gthr_id AND cm.del_yn = false) AS cmnt_count,
    CASE WHEN p_mem_id IS NULL THEN false
         ELSE EXISTS (SELECT 1 FROM public.gthr_attd_rel ar WHERE ar.gthr_id = g.gthr_id AND ar.mem_id = p_mem_id)
    END AS is_attending
  FROM public.gthr_mst g
  LEFT JOIN public.mem_mst m ON m.mem_id = g.crt_by
  WHERE g.team_id = p_team_id
    AND g.del_yn  = false
    AND (p_start IS NULL OR g.stt_at >= (p_start::timestamp AT TIME ZONE 'Asia/Seoul'))
    AND (p_end   IS NULL OR g.stt_at <  ((p_end::timestamp + interval '1 day') AT TIME ZONE 'Asia/Seoul'))
  ORDER BY g.stt_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_gatherings(uuid, date, date, uuid)
  TO anon, authenticated, service_role;
