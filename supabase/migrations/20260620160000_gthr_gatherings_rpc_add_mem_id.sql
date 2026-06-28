-- get_public_team_gatherings에 p_mem_id 오버로드 추가
-- is_attending, short_id 반환 포함
-- fan-out 방지: scalar subquery로 attd_count, cmnt_count 집계

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
    AND (p_start IS NULL OR g.stt_at >= (p_start::timestamptz AT TIME ZONE 'Asia/Seoul'))
    AND (p_end   IS NULL OR g.stt_at <  ((p_end::timestamptz + interval '1 day') AT TIME ZONE 'Asia/Seoul'))
  ORDER BY g.stt_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_gatherings(uuid, date, date, uuid)
  TO anon, authenticated, service_role;
