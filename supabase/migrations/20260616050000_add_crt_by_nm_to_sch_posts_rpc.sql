-- get_public_team_sch_posts: 작성자 이름(crt_by_nm) 추가
DROP FUNCTION IF EXISTS public.get_public_team_sch_posts(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_public_team_sch_posts(
  p_team_id uuid,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  sch_post_id uuid,
  sch_nm text,
  post_type text,
  evt_stt_at timestamptz,
  evt_end_at timestamptz,
  url text,
  cont_txt text,
  crt_by uuid,
  crt_by_nm text,
  cmnt_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.sch_post_id,
    s.sch_nm,
    s.post_type,
    s.evt_stt_at,
    s.evt_end_at,
    s.url,
    s.cont_txt,
    s.crt_by,
    m.mem_nm,
    COALESCE((
      SELECT count(*)
      FROM public.cmnt_mst cm
      WHERE cm.entity_type = 'sch_post'
        AND cm.entity_id = s.sch_post_id
        AND cm.del_yn = false
    ), 0) AS cmnt_count
  FROM public.sch_post_mst s
  LEFT JOIN public.mem_mst m ON m.mem_id = s.crt_by
  WHERE s.team_id = p_team_id
    AND s.del_yn = false
    AND (p_start IS NULL OR s.evt_stt_at::date >= p_start)
    AND (p_end IS NULL OR s.evt_stt_at::date <= p_end)
  ORDER BY s.evt_stt_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_sch_posts(uuid, date, date) TO anon, authenticated, service_role;
