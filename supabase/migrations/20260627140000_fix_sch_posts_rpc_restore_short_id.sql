-- get_public_team_sch_posts: short_id 반환 복구
-- calendar_rpc_cmnt_cte(20260622220000)가 cmnt_count CTE 리팩터링하며 short_id 반환을 누락시킨 회귀 수정.
-- 증상: 일정 공유 링크가 short_id 대신 긴 UUID로 생성됨 (타입·런타임 에러 없이 조용히 동작해 미발견).
-- database.types.ts·프론트 코드·prd는 모두 short_id 존재를 가정 → dev DB만 회귀 상태였음.

DROP FUNCTION IF EXISTS public.get_public_team_sch_posts(uuid, date, date);

CREATE FUNCTION public.get_public_team_sch_posts(
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
  s.sch_post_id,
  s.short_id,
  s.sch_nm,
  s.post_type,
  s.evt_stt_at,
  s.evt_end_at,
  s.url,
  s.cont_txt,
  s.crt_by,
  m.mem_nm                   AS crt_by_nm,
  COALESCE(ca.cmnt_count, 0) AS cmnt_count
FROM public.sch_post_mst s
LEFT JOIN public.mem_mst m  ON m.mem_id       = s.crt_by
LEFT JOIN cmnt_agg ca       ON ca.sch_post_id  = s.sch_post_id
WHERE s.team_id = p_team_id
  AND s.del_yn  = false
  AND (p_start IS NULL OR s.evt_stt_at::date >= p_start)
  AND (p_end   IS NULL OR s.evt_stt_at::date <= p_end)
ORDER BY s.evt_stt_at ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_team_sch_posts(uuid, date, date)
  TO anon, authenticated, service_role;
