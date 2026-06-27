-- get_schedule_paged: gathering 항목에 sprt_cd 반환 추가 (리스트뷰 종목 태그용)
-- sch_post/comp 항목은 sprt_cd NULL. dev·prd 양쪽 적용.
DROP FUNCTION IF EXISTS public.get_schedule_paged(uuid, text, date, uuid, int);

CREATE FUNCTION public.get_schedule_paged(
  p_team_id uuid, p_direction text, p_cursor_date date, p_mem_id uuid DEFAULT NULL::uuid, p_month_limit integer DEFAULT 2
)
RETURNS TABLE(
  item_type text, item_id uuid, item_nm text, post_type text, start_date date, end_date date,
  loc_nm text, url text, cont_txt text, evt_stt_at timestamptz, evt_end_at timestamptz,
  crt_by uuid, crt_by_nm text, reg_count bigint, cmnt_count bigint, short_id text, sprt_cd text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH
my_regs AS (
  SELECT DISTINCT team_comp_id FROM public.comp_reg_rel WHERE mem_id = p_mem_id AND vers = 0 AND del_yn = false
),
my_attd AS (
  SELECT DISTINCT gthr_id FROM public.gthr_attd_rel WHERE mem_id = p_mem_id
),
sch_dates AS (
  SELECT (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date AS event_date
  FROM public.sch_post_mst s WHERE s.team_id = p_team_id AND s.del_yn = false
    AND ((p_direction = 'prev' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date < p_cursor_date) OR
         (p_direction = 'next' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date > p_cursor_date))
),
comp_dates AS (
  SELECT DISTINCT c.stt_dt AS event_date
  FROM public.team_comp_plan_rel tcp
  JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false
    AND ((p_direction = 'prev' AND c.stt_dt < p_cursor_date) OR (p_direction = 'next' AND c.stt_dt > p_cursor_date))
    AND (EXISTS (SELECT 1 FROM public.comp_reg_rel cr WHERE cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false)
         OR EXISTS (SELECT 1 FROM my_regs mr WHERE mr.team_comp_id = tcp.team_comp_id))
),
gthr_dates AS (
  SELECT (g.stt_at AT TIME ZONE 'Asia/Seoul')::date AS event_date
  FROM public.gthr_mst g WHERE g.team_id = p_team_id AND g.del_yn = false
    AND ((p_direction = 'prev' AND (g.stt_at AT TIME ZONE 'Asia/Seoul')::date < p_cursor_date) OR
         (p_direction = 'next' AND (g.stt_at AT TIME ZONE 'Asia/Seoul')::date > p_cursor_date))
),
month_candidates AS (
  SELECT DISTINCT DATE_TRUNC('month', event_date)::date AS month_start
  FROM (SELECT event_date FROM sch_dates UNION SELECT event_date FROM comp_dates UNION SELECT event_date FROM gthr_dates) all_dates
),
target_months AS (
  (SELECT month_start FROM month_candidates WHERE p_direction = 'prev' ORDER BY month_start DESC LIMIT p_month_limit)
  UNION ALL
  (SELECT month_start FROM month_candidates WHERE p_direction = 'next' ORDER BY month_start ASC LIMIT p_month_limit)
),
date_range AS (
  SELECT MIN(month_start) AS range_start, (MAX(month_start) + interval '1 month' - interval '1 day')::date AS range_end FROM target_months
),
gthr_agg AS (
  SELECT g.gthr_id, COUNT(DISTINCT ar.attd_id) AS attd_count, COUNT(DISTINCT cm.cmnt_id) AS cmnt_count
  FROM public.gthr_mst g CROSS JOIN date_range
  LEFT JOIN public.gthr_attd_rel ar ON ar.gthr_id = g.gthr_id
  LEFT JOIN public.cmnt_mst cm ON cm.entity_type = 'gathering' AND cm.entity_id = g.gthr_id AND cm.del_yn = false
  WHERE g.team_id = p_team_id AND g.del_yn = false AND date_range.range_start IS NOT NULL
    AND g.stt_at >= (date_range.range_start::timestamptz AT TIME ZONE 'Asia/Seoul')
    AND g.stt_at <  ((date_range.range_end::timestamptz + interval '1 day') AT TIME ZONE 'Asia/Seoul')
  GROUP BY g.gthr_id
)
SELECT
  'sch_post'::text                                AS item_type,
  s.sch_post_id                                  AS item_id,
  s.sch_nm                                       AS item_nm,
  s.post_type                                    AS post_type,
  (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date AS start_date,
  NULL::date                                     AS end_date,
  NULL::text                                     AS loc_nm,
  s.url                                          AS url,
  s.cont_txt                                     AS cont_txt,
  s.evt_stt_at                                   AS evt_stt_at,
  s.evt_end_at                                   AS evt_end_at,
  s.crt_by                                       AS crt_by,
  m.mem_nm                                       AS crt_by_nm,
  NULL::bigint                                   AS reg_count,
  COALESCE((SELECT count(*) FROM public.cmnt_mst cm WHERE cm.entity_type = 'sch_post' AND cm.entity_id = s.sch_post_id AND cm.del_yn = false), 0) AS cmnt_count,
  s.short_id                                     AS short_id,
  NULL::text                                     AS sprt_cd
FROM public.sch_post_mst s CROSS JOIN date_range
LEFT JOIN public.mem_mst m ON m.mem_id = s.crt_by
WHERE s.team_id = p_team_id AND s.del_yn = false AND date_range.range_start IS NOT NULL
  AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN date_range.range_start AND date_range.range_end
UNION ALL
SELECT
  CASE WHEN mr.team_comp_id IS NOT NULL THEN 'mine' ELSE 'comp' END, c.comp_id, c.comp_nm, NULL::text,
  c.stt_dt, c.end_dt, c.loc_nm, c.src_url, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::uuid, NULL::text,
  count(DISTINCT cr.comp_reg_id),
  COALESCE((SELECT count(*) FROM public.cmnt_mst cm WHERE cm.entity_type = 'comp' AND cm.entity_id = c.comp_id AND cm.del_yn = false), 0),
  NULL::text,
  NULL::text
FROM public.team_comp_plan_rel tcp
JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
CROSS JOIN date_range
LEFT JOIN public.comp_reg_rel cr ON cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
LEFT JOIN my_regs mr ON mr.team_comp_id = tcp.team_comp_id
WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false AND date_range.range_start IS NOT NULL
  AND c.stt_dt BETWEEN date_range.range_start AND date_range.range_end
GROUP BY c.comp_id, c.comp_nm, c.stt_dt, c.end_dt, c.loc_nm, c.src_url, mr.team_comp_id
HAVING count(DISTINCT cr.comp_reg_id) > 0 OR mr.team_comp_id IS NOT NULL
UNION ALL
SELECT
  CASE WHEN ma.gthr_id IS NOT NULL THEN 'gathering_mine' ELSE 'gathering' END, g.gthr_id, g.gthr_nm, g.gthr_type_enm,
  (g.stt_at AT TIME ZONE 'Asia/Seoul')::date, NULL::date, g.loc_txt, NULL::text, g.desc_txt,
  g.stt_at, g.end_at, g.crt_by, m.mem_nm,
  COALESCE(ga.attd_count, 0), COALESCE(ga.cmnt_count, 0), g.short_id, g.sprt_cd
FROM public.gthr_mst g CROSS JOIN date_range
LEFT JOIN public.mem_mst m ON m.mem_id = g.crt_by
LEFT JOIN my_attd ma ON ma.gthr_id = g.gthr_id
LEFT JOIN gthr_agg ga ON ga.gthr_id = g.gthr_id
WHERE g.team_id = p_team_id AND g.del_yn = false AND date_range.range_start IS NOT NULL
  AND g.stt_at >= (date_range.range_start::timestamptz AT TIME ZONE 'Asia/Seoul')
  AND g.stt_at <  ((date_range.range_end::timestamptz + interval '1 day') AT TIME ZONE 'Asia/Seoul')
ORDER BY start_date ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_schedule_paged(uuid, text, date, uuid, int)
  TO anon, authenticated, service_role;
