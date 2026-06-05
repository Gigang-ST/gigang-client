-- 랭킹/최근기록 RPC에서 비활성 회원 제외
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
   AND tm.mem_st_cd = 'active'
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
   AND tm.mem_st_cd = 'active'
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
   AND tm.mem_st_cd = 'active'
   AND tm.vers = 0
   AND tm.del_yn = false
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = up.mem_id
   AND mm.vers = 0
   AND mm.del_yn = false
  WHERE up.vers = 0
    AND up.del_yn = false;
$$;
