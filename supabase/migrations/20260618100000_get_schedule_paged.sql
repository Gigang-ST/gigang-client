-- get_schedule_paged: 방향 기반 스크롤 페이지네이션
-- 이벤트가 있는 가장 가까운 N달의 일정을 한 번의 쿼리로 반환
-- 빈 달을 건너뛰는 청크 탐색 없이 DB 내부에서 CTE로 처리

CREATE OR REPLACE FUNCTION public.get_schedule_paged(
  p_team_id     uuid,
  p_direction   text,         -- 'prev' | 'next'
  p_cursor_date date,         -- prev: 가장 오래된 달의 1일, next: 가장 최근 달의 말일
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
  cmnt_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
-- 멤버 본인 등록 대회 목록
my_regs AS (
  SELECT DISTINCT team_comp_id
  FROM public.comp_reg_rel
  WHERE mem_id = p_mem_id
    AND vers = 0
    AND del_yn = false
),

-- 공유 일정 날짜 (방향 기준 필터)
sch_dates AS (
  SELECT (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date AS event_date
  FROM public.sch_post_mst s
  WHERE s.team_id = p_team_id
    AND s.del_yn = false
    AND (
      (p_direction = 'prev' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date < p_cursor_date) OR
      (p_direction = 'next' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date > p_cursor_date)
    )
),

-- 대회 날짜 (참가자 있거나 본인 등록)
comp_dates AS (
  SELECT DISTINCT c.stt_dt AS event_date
  FROM public.team_comp_plan_rel tcp
  JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  WHERE tcp.team_id = p_team_id
    AND tcp.vers = 0
    AND tcp.del_yn = false
    AND (
      (p_direction = 'prev' AND c.stt_dt < p_cursor_date) OR
      (p_direction = 'next' AND c.stt_dt > p_cursor_date)
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.comp_reg_rel cr
        WHERE cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
      )
      OR EXISTS (
        SELECT 1 FROM my_regs mr WHERE mr.team_comp_id = tcp.team_comp_id
      )
    )
),

-- 이벤트가 있는 달 후보 (두 소스 합산)
month_candidates AS (
  SELECT DISTINCT DATE_TRUNC('month', event_date)::date AS month_start
  FROM (
    SELECT event_date FROM sch_dates
    UNION
    SELECT event_date FROM comp_dates
  ) all_dates
),

-- 방향에 따라 N달 선택 (prev: 최근순 DESC, next: 오래된순 ASC)
target_months AS (
  ( SELECT month_start FROM month_candidates WHERE p_direction = 'prev' ORDER BY month_start DESC LIMIT p_month_limit )
  UNION ALL
  ( SELECT month_start FROM month_candidates WHERE p_direction = 'next' ORDER BY month_start ASC  LIMIT p_month_limit )
),

-- 선택된 달들의 실제 조회 범위
date_range AS (
  SELECT
    MIN(month_start)                                                  AS range_start,
    (MAX(month_start) + interval '1 month' - interval '1 day')::date AS range_end
  FROM target_months
)

-- 공유 일정
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
  ), 0)                                          AS cmnt_count
FROM public.sch_post_mst s
CROSS JOIN date_range
LEFT JOIN public.mem_mst m ON m.mem_id = s.crt_by
WHERE s.team_id = p_team_id
  AND s.del_yn = false
  AND date_range.range_start IS NOT NULL
  AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN date_range.range_start AND date_range.range_end

UNION ALL

-- 대회 (참가자 있거나 본인 등록, 중복 없이)
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
  ), 0)                                                              AS cmnt_count
FROM public.team_comp_plan_rel tcp
JOIN public.comp_mst c
  ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
CROSS JOIN date_range
LEFT JOIN public.comp_reg_rel cr
  ON cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
LEFT JOIN my_regs mr
  ON mr.team_comp_id = tcp.team_comp_id
WHERE tcp.team_id = p_team_id
  AND tcp.vers = 0
  AND tcp.del_yn = false
  AND date_range.range_start IS NOT NULL
  AND c.stt_dt BETWEEN date_range.range_start AND date_range.range_end
GROUP BY c.comp_id, c.comp_nm, c.stt_dt, c.end_dt, c.loc_nm, c.src_url, mr.team_comp_id
HAVING count(DISTINCT cr.comp_reg_id) > 0 OR mr.team_comp_id IS NOT NULL

ORDER BY start_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_paged(uuid, text, date, uuid, int)
  TO anon, authenticated, service_role;
