-- get_public_team_competitions: cmnt_count 필드 추가
-- get_public_team_sch_posts: sch_post_mst 댓글 수 포함 조회 RPC 신규 추가

DROP FUNCTION IF EXISTS public.get_public_team_competitions(uuid, date, date);

CREATE FUNCTION public.get_public_team_competitions(
  p_team_id uuid,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  comp_id uuid,
  ext_id text,
  comp_sprt_cd text,
  comp_nm text,
  stt_dt date,
  end_dt date,
  loc_nm text,
  src_url text,
  comp_evt_types text[],
  reg_evt_types text[],
  reg_count bigint,
  cmnt_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.comp_id,
    c.ext_id,
    c.comp_sprt_cd,
    c.comp_nm,
    c.stt_dt,
    c.end_dt,
    c.loc_nm,
    c.src_url,
    COALESCE(array_agg(DISTINCT ce.comp_evt_type) FILTER (WHERE ce.comp_evt_type IS NOT NULL), '{}') AS comp_evt_types,
    COALESCE(array_agg(DISTINCT re.comp_evt_type) FILTER (WHERE re.comp_evt_type IS NOT NULL), '{}') AS reg_evt_types,
    count(DISTINCT cr.comp_reg_id) AS reg_count,
    COALESCE((
      SELECT count(*)
      FROM public.cmnt_mst cm
      WHERE cm.entity_type = 'comp'
        AND cm.entity_id = c.comp_id
        AND cm.del_yn = false
    ), 0) AS cmnt_count
  FROM public.team_comp_plan_rel tcp
  INNER JOIN public.comp_mst c
    ON c.comp_id = tcp.comp_id
   AND c.vers = 0
   AND c.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce
    ON ce.comp_id = c.comp_id
   AND ce.vers = 0
   AND ce.del_yn = false
  LEFT JOIN public.comp_reg_rel cr
    ON cr.team_comp_id = tcp.team_comp_id
   AND cr.vers = 0
   AND cr.del_yn = false
  LEFT JOIN public.comp_evt_cfg re
    ON re.comp_evt_id = cr.comp_evt_id
   AND re.vers = 0
   AND re.del_yn = false
  WHERE tcp.team_id = p_team_id
    AND tcp.vers = 0
    AND tcp.del_yn = false
    AND (p_start IS NULL OR c.stt_dt >= p_start)
    AND (p_end IS NULL OR c.stt_dt <= p_end)
  GROUP BY c.comp_id, c.ext_id, c.comp_sprt_cd, c.comp_nm, c.stt_dt, c.end_dt, c.loc_nm, c.src_url
  ORDER BY c.stt_dt ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_competitions(uuid, date, date) TO anon, authenticated, service_role;

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
    COALESCE((
      SELECT count(*)
      FROM public.cmnt_mst cm
      WHERE cm.entity_type = 'sch_post'
        AND cm.entity_id = s.sch_post_id
        AND cm.del_yn = false
    ), 0) AS cmnt_count
  FROM public.sch_post_mst s
  WHERE s.team_id = p_team_id
    AND s.del_yn = false
    AND (p_start IS NULL OR s.evt_stt_at::date >= p_start)
    AND (p_end IS NULL OR s.evt_stt_at::date <= p_end)
  ORDER BY s.evt_stt_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_sch_posts(uuid, date, date) TO anon, authenticated, service_role;
