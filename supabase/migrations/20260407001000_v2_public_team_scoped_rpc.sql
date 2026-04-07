-- v2 공개 페이지용: 팀 스코프 공개 데이터 RPC

CREATE OR REPLACE FUNCTION public.get_public_team_competitions(
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
  reg_count bigint
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
    count(DISTINCT cr.comp_reg_id) AS reg_count
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

CREATE OR REPLACE FUNCTION public.get_public_team_recent_records(
  p_team_id uuid,
  p_limit integer DEFAULT 2
)
RETURNS TABLE (
  mem_id uuid,
  mem_nm text,
  evt_cd text,
  rec_time_sec integer,
  race_nm text,
  upd_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rr.mem_id,
    mm.mem_nm,
    COALESCE(ce.comp_evt_type, 'UNKNOWN') AS evt_cd,
    rr.rec_time_sec,
    rr.race_nm,
    rr.upd_at
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm
    ON tm.mem_id = rr.mem_id
   AND tm.team_id = p_team_id
   AND tm.vers = 0
   AND tm.del_yn = false
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = rr.mem_id
   AND mm.vers = 0
   AND mm.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id
   AND ce.vers = 0
   AND ce.del_yn = false
  WHERE rr.vers = 0
    AND rr.del_yn = false
  ORDER BY rr.upd_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 2), 1);
$$;

CREATE OR REPLACE FUNCTION public.get_public_team_race_rankings(
  p_team_id uuid
)
RETURNS TABLE (
  mem_id uuid,
  mem_nm text,
  gdr_enm public.gender,
  evt_cd text,
  rec_time_sec integer,
  race_nm text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rr.mem_id,
    mm.mem_nm,
    mm.gdr_enm,
    COALESCE(ce.comp_evt_type, 'UNKNOWN') AS evt_cd,
    rr.rec_time_sec,
    rr.race_nm
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm
    ON tm.mem_id = rr.mem_id
   AND tm.team_id = p_team_id
   AND tm.vers = 0
   AND tm.del_yn = false
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = rr.mem_id
   AND mm.vers = 0
   AND mm.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id
   AND ce.vers = 0
   AND ce.del_yn = false
  WHERE rr.vers = 0
    AND rr.del_yn = false;
$$;

CREATE OR REPLACE FUNCTION public.get_public_team_utmb_rankings(
  p_team_id uuid
)
RETURNS TABLE (
  mem_id uuid,
  mem_nm text,
  utmb_idx integer,
  utmb_prf_url text,
  rct_race_nm text,
  rct_race_rec text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    up.mem_id,
    mm.mem_nm,
    up.utmb_idx,
    up.utmb_prf_url,
    up.rct_race_nm,
    up.rct_race_rec
  FROM public.mem_utmb_prf up
  INNER JOIN public.team_mem_rel tm
    ON tm.mem_id = up.mem_id
   AND tm.team_id = p_team_id
   AND tm.vers = 0
   AND tm.del_yn = false
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = up.mem_id
   AND mm.vers = 0
   AND mm.del_yn = false
  WHERE up.vers = 0
    AND up.del_yn = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_competitions(uuid, date, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_team_recent_records(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_team_race_rankings(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_team_utmb_rankings(uuid) TO anon, authenticated, service_role;
