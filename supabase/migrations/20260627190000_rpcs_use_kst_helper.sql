-- 캘린더 RPC들의 KST 날짜 경계를 kst_day_start/kst_day_end_excl 헬퍼로 교정 (dev·prd 적용).
--
-- 수정 대상 버그:
--   - get_public_team_gatherings: g.stt_at >= (p_start::timestamptz AT TIME ZONE 'Asia/Seoul')
--       → date를 timestamptz로 캐스팅하면서 세션TZ가 개입, KST 자정이 아닌 KST 09:00이 경계가 됨(9시간 밀림).
--   - get_public_team_sch_posts: evt_stt_at::date >= p_start
--       → ::date가 세션TZ(UTC) 기준으로 잘려 KST 밤 일정이 하루 밀려 분류됨.
--   - get_schedule_paged: gthr_agg / 최종 gthr SELECT의 범위 필터가 위와 동일한 9시간 밀림 버그.
-- 증상: 월 말일·새벽(KST 0~9시) 모임/소식이 해당 월 캘린더에서 누락.
--
-- 유지(정상 패턴):
--   - timestamptz AT TIME ZONE 'Asia/Seoul')::date  ← timestamptz를 KST 벽시계 날짜로 변환(올바름)
--   - comp_mst.stt_dt 는 date 컬럼이라 타임존 영향 없음 → 그대로 date 비교.

-- ── 1. get_public_team_gatherings ──
CREATE OR REPLACE FUNCTION public.get_public_team_gatherings(
  p_team_id uuid, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_mem_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  gthr_id uuid, short_id text, gthr_nm text, gthr_type_enm text, sprt_cd text,
  stt_at timestamptz, end_at timestamptz, loc_txt text, desc_txt text,
  crt_by uuid, crt_by_nm text, attd_count bigint, cmnt_count bigint, is_attending boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH attd_agg AS (
  SELECT gthr_id, COUNT(*) AS attd_count FROM public.gthr_attd_rel GROUP BY gthr_id
),
cmnt_agg AS (
  SELECT entity_id AS gthr_id, COUNT(*) AS cmnt_count FROM public.cmnt_mst
  WHERE entity_type = 'gathering' AND del_yn = false GROUP BY entity_id
),
my_attd AS (
  SELECT gthr_id FROM public.gthr_attd_rel WHERE mem_id = p_mem_id
)
SELECT g.gthr_id, g.short_id, g.gthr_nm, g.gthr_type_enm, g.sprt_cd,
  g.stt_at, g.end_at, g.loc_txt, g.desc_txt, g.crt_by,
  m.mem_nm AS crt_by_nm,
  COALESCE(aa.attd_count, 0) AS attd_count,
  COALESCE(ca.cmnt_count, 0) AS cmnt_count,
  CASE WHEN p_mem_id IS NULL THEN false ELSE ma.gthr_id IS NOT NULL END AS is_attending
FROM public.gthr_mst g
LEFT JOIN public.mem_mst m  ON m.mem_id   = g.crt_by
LEFT JOIN attd_agg aa       ON aa.gthr_id = g.gthr_id
LEFT JOIN cmnt_agg ca       ON ca.gthr_id = g.gthr_id
LEFT JOIN my_attd ma        ON ma.gthr_id = g.gthr_id
WHERE g.team_id = p_team_id AND g.del_yn = false
  AND (p_start IS NULL OR g.stt_at >= public.kst_day_start(p_start))
  AND (p_end   IS NULL OR g.stt_at <  public.kst_day_end_excl(p_end))
ORDER BY g.stt_at ASC;
$function$;

-- ── 2. get_public_team_sch_posts ──
CREATE OR REPLACE FUNCTION public.get_public_team_sch_posts(
  p_team_id uuid, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date
)
RETURNS TABLE(
  sch_post_id uuid, short_id text, sch_nm text, post_type text,
  evt_stt_at timestamp with time zone, evt_end_at timestamp with time zone,
  url text, cont_txt text, crt_by uuid, crt_by_nm text, cmnt_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH cmnt_agg AS (
  SELECT entity_id AS sch_post_id, COUNT(*) AS cmnt_count
  FROM public.cmnt_mst
  WHERE entity_type = 'sch_post' AND del_yn = false
  GROUP BY entity_id
)
SELECT
  s.sch_post_id, s.short_id, s.sch_nm, s.post_type,
  s.evt_stt_at, s.evt_end_at, s.url, s.cont_txt, s.crt_by,
  m.mem_nm                   AS crt_by_nm,
  COALESCE(ca.cmnt_count, 0) AS cmnt_count
FROM public.sch_post_mst s
LEFT JOIN public.mem_mst m  ON m.mem_id       = s.crt_by
LEFT JOIN cmnt_agg ca       ON ca.sch_post_id  = s.sch_post_id
WHERE s.team_id = p_team_id
  AND s.del_yn  = false
  AND (p_start IS NULL OR s.evt_stt_at >= public.kst_day_start(p_start))
  AND (p_end   IS NULL OR s.evt_stt_at <  public.kst_day_end_excl(p_end))
ORDER BY s.evt_stt_at ASC;
$function$;

-- ── 3. get_schedule_paged (gthr 범위 필터만 헬퍼로 교정, 나머지는 정상 패턴 유지) ──
CREATE OR REPLACE FUNCTION public.get_schedule_paged(p_team_id uuid, p_direction text, p_cursor_date date, p_mem_id uuid DEFAULT NULL::uuid, p_month_limit integer DEFAULT 2)
 RETURNS TABLE(item_type text, item_id uuid, item_nm text, post_type text, start_date date, end_date date, loc_nm text, url text, cont_txt text, evt_stt_at timestamp with time zone, evt_end_at timestamp with time zone, crt_by uuid, crt_by_nm text, reg_count bigint, cmnt_count bigint, short_id text, sprt_cd text)
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
    AND g.stt_at >= public.kst_day_start(date_range.range_start)
    AND g.stt_at <  public.kst_day_end_excl(date_range.range_end)
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
  AND g.stt_at >= public.kst_day_start(date_range.range_start)
  AND g.stt_at <  public.kst_day_end_excl(date_range.range_end)
ORDER BY start_date ASC;
$function$;
