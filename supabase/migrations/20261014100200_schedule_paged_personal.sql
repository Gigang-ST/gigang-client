-- 리스트뷰 무한스크롤 RPC(get_schedule_paged)에 개인 일정(mem_sch_mst) 분기를 더한다.
--
-- 리스트뷰는 이 RPC가 "일정이 있는 달"을 골라 N개월씩 넘겨주는 구조라, 개인 일정을 클라이언트가
-- 따로 붙이면 공개 일정이 없는 달의 개인 일정이 통째로 빠진다. 그래서 달 후보(month_candidates)부터
-- 개인 일정을 함께 센다.
--
-- ⚠️ 개인 일정은 p_mem_id 가 아니라 v2_rls_resolve_mem_id()(JWT)로 고른다. p_mem_id 는 클라이언트가
-- 보내는 값이고 이 함수는 SECURITY DEFINER 라, 그걸 믿으면 남의 id 를 넣어 남의 개인 일정을 읽는다.
-- 비로그인(anon)은 resolve 가 NULL 이라 개인 분기가 비어 기존과 똑같이 돈다.
--
-- 반환 타입은 그대로라 CREATE OR REPLACE 로 충분하다(GRANT 유지). 나머지 세 분기는 한 글자도 안 바꿨다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_schedule_paged(
  p_team_id uuid, p_direction text, p_cursor_date date, p_mem_id uuid DEFAULT NULL::uuid, p_month_limit integer DEFAULT 2
)
RETURNS TABLE(
  item_type text, item_id uuid, item_nm text, post_type text, start_date date, end_date date,
  loc_nm text, url text, cont_txt text, evt_stt_at timestamptz, evt_end_at timestamptz,
  crt_by uuid, crt_by_nm text, reg_count bigint, cmnt_count bigint, short_id text, sprt_cd text,
  max_prt_cnt int
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
-- 개인 일정 주인 — 클라이언트 인자가 아니라 JWT 에서 (위 ⚠️)
me AS (
  SELECT public.v2_rls_resolve_mem_id() AS mem_id
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
prsn_dates AS (
  SELECT ps.sch_dt AS event_date
  FROM public.mem_sch_mst ps JOIN me ON ps.mem_id = me.mem_id
  WHERE ps.team_id = p_team_id AND ps.del_yn = false
    AND ((p_direction = 'prev' AND ps.sch_dt < p_cursor_date) OR (p_direction = 'next' AND ps.sch_dt > p_cursor_date))
),
month_candidates AS (
  SELECT DISTINCT DATE_TRUNC('month', event_date)::date AS month_start
  FROM (SELECT event_date FROM sch_dates UNION SELECT event_date FROM comp_dates UNION SELECT event_date FROM gthr_dates
        UNION SELECT event_date FROM prsn_dates) all_dates
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
  NULL::text                                     AS sprt_cd,
  NULL::int                                      AS max_prt_cnt
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
  NULL::text,
  NULL::int
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
  COALESCE(ga.attd_count, 0), COALESCE(ga.cmnt_count, 0), g.short_id, g.sprt_cd,
  g.max_prt_cnt
FROM public.gthr_mst g CROSS JOIN date_range
LEFT JOIN public.mem_mst m ON m.mem_id = g.crt_by
LEFT JOIN my_attd ma ON ma.gthr_id = g.gthr_id
LEFT JOIN gthr_agg ga ON ga.gthr_id = g.gthr_id
WHERE g.team_id = p_team_id AND g.del_yn = false AND date_range.range_start IS NOT NULL
  AND g.stt_at >= public.kst_day_start(date_range.range_start)
  AND g.stt_at <  public.kst_day_end_excl(date_range.range_end)
UNION ALL
-- 개인 일정 — 시각은 KST 벽시계라 (날짜+시각)을 KST 로 해석해 timestamptz 로 돌려준다.
-- 시작 시각이 없으면(종일) evt_stt_at 이 NULL 이다.
SELECT
  'personal'::text, ps.mem_sch_id, ps.sch_nm::text, NULL::text,
  ps.sch_dt, NULL::date, NULL::text, NULL::text, ps.cont_txt::text,
  CASE WHEN ps.stt_tm IS NOT NULL THEN (ps.sch_dt + ps.stt_tm) AT TIME ZONE 'Asia/Seoul' END,
  CASE WHEN ps.end_tm IS NOT NULL THEN (ps.sch_dt + ps.end_tm) AT TIME ZONE 'Asia/Seoul' END,
  ps.mem_id, NULL::text,
  NULL::bigint, 0::bigint, NULL::text, NULL::text,
  NULL::int
FROM public.mem_sch_mst ps
JOIN me ON ps.mem_id = me.mem_id
CROSS JOIN date_range
WHERE ps.team_id = p_team_id AND ps.del_yn = false AND date_range.range_start IS NOT NULL
  AND ps.sch_dt BETWEEN date_range.range_start AND date_range.range_end
ORDER BY start_date ASC;
$function$;
