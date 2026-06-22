-- ============================================================
-- 캘린더용 RPC 3종: cmnt_count 스칼라 서브쿼리 → CTE 사전 집계로 교체
-- 기존: 행마다 cmnt_mst COUNT 서브쿼리 N번 실행
-- 변경: 범위 내 전체 댓글을 CTE로 1번 집계 후 JOIN
-- ============================================================

-- 기존 함수 DROP (시그니처 충돌 방지)
DROP FUNCTION IF EXISTS public.get_public_team_competitions(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_public_team_sch_posts(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_public_team_gatherings(uuid, date, date, uuid);

-- ── 1. get_public_team_competitions ──────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_team_competitions(
  p_team_id uuid,
  p_start   date DEFAULT NULL,
  p_end     date DEFAULT NULL
)
RETURNS TABLE (
  comp_id        uuid,
  ext_id         text,
  comp_sprt_cd   text,
  comp_nm        text,
  stt_dt         date,
  end_dt         date,
  loc_nm         text,
  src_url        text,
  comp_evt_types text[],
  reg_evt_types  text[],
  reg_count      bigint,
  cmnt_count     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH cmnt_agg AS (
  SELECT entity_id AS comp_id, COUNT(*) AS cmnt_count
  FROM public.cmnt_mst
  WHERE entity_type = 'comp'
    AND del_yn = false
  GROUP BY entity_id
)
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
  count(DISTINCT cr.comp_reg_id)                                                                    AS reg_count,
  COALESCE(ca.cmnt_count, 0)                                                                        AS cmnt_count
FROM public.team_comp_plan_rel tcp
INNER JOIN public.comp_mst c
  ON c.comp_id = tcp.comp_id
 AND c.vers    = 0
 AND c.del_yn  = false
LEFT JOIN public.comp_evt_cfg ce
  ON ce.comp_id = c.comp_id
 AND ce.vers    = 0
 AND ce.del_yn  = false
LEFT JOIN public.comp_reg_rel cr
  ON cr.team_comp_id = tcp.team_comp_id
 AND cr.vers         = 0
 AND cr.del_yn       = false
LEFT JOIN public.comp_evt_cfg re
  ON re.comp_evt_id = cr.comp_evt_id
 AND re.vers        = 0
 AND re.del_yn      = false
LEFT JOIN cmnt_agg ca ON ca.comp_id = c.comp_id
WHERE tcp.team_id = p_team_id
  AND tcp.vers    = 0
  AND tcp.del_yn  = false
  AND (p_start IS NULL OR c.stt_dt >= p_start)
  AND (p_end   IS NULL OR c.stt_dt <= p_end)
GROUP BY
  c.comp_id, c.ext_id, c.comp_sprt_cd, c.comp_nm,
  c.stt_dt, c.end_dt, c.loc_nm, c.src_url, ca.cmnt_count
ORDER BY c.stt_dt ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_competitions(uuid, date, date)
  TO anon, authenticated, service_role;


-- ── 2. get_public_team_sch_posts ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_team_sch_posts(
  p_team_id uuid,
  p_start   date DEFAULT NULL,
  p_end     date DEFAULT NULL
)
RETURNS TABLE (
  sch_post_id uuid,
  sch_nm      text,
  post_type   text,
  evt_stt_at  timestamptz,
  evt_end_at  timestamptz,
  url         text,
  cont_txt    text,
  crt_by      uuid,
  crt_by_nm   text,
  cmnt_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH cmnt_agg AS (
  SELECT entity_id AS sch_post_id, COUNT(*) AS cmnt_count
  FROM public.cmnt_mst
  WHERE entity_type = 'sch_post'
    AND del_yn = false
  GROUP BY entity_id
)
SELECT
  s.sch_post_id,
  s.sch_nm,
  s.post_type,
  s.evt_stt_at,
  s.evt_end_at,
  s.url,
  s.cont_txt,
  s.crt_by,
  m.mem_nm                        AS crt_by_nm,
  COALESCE(ca.cmnt_count, 0)      AS cmnt_count
FROM public.sch_post_mst s
LEFT JOIN public.mem_mst m  ON m.mem_id      = s.crt_by
LEFT JOIN cmnt_agg ca       ON ca.sch_post_id = s.sch_post_id
WHERE s.team_id = p_team_id
  AND s.del_yn  = false
  AND (p_start IS NULL OR s.evt_stt_at::date >= p_start)
  AND (p_end   IS NULL OR s.evt_stt_at::date <= p_end)
ORDER BY s.evt_stt_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_sch_posts(uuid, date, date)
  TO anon, authenticated, service_role;


-- ── 3. get_public_team_gatherings ────────────────────────────

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
WITH attd_agg AS (
  SELECT gthr_id, COUNT(*) AS attd_count
  FROM public.gthr_attd_rel
  GROUP BY gthr_id
),
cmnt_agg AS (
  SELECT entity_id AS gthr_id, COUNT(*) AS cmnt_count
  FROM public.cmnt_mst
  WHERE entity_type = 'gathering'
    AND del_yn = false
  GROUP BY entity_id
),
my_attd AS (
  SELECT gthr_id
  FROM public.gthr_attd_rel
  WHERE mem_id = p_mem_id
)
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
  m.mem_nm                                              AS crt_by_nm,
  COALESCE(aa.attd_count, 0)                            AS attd_count,
  COALESCE(ca.cmnt_count, 0)                            AS cmnt_count,
  CASE WHEN p_mem_id IS NULL THEN false
       ELSE ma.gthr_id IS NOT NULL
  END                                                   AS is_attending
FROM public.gthr_mst g
LEFT JOIN public.mem_mst m  ON m.mem_id   = g.crt_by
LEFT JOIN attd_agg aa       ON aa.gthr_id = g.gthr_id
LEFT JOIN cmnt_agg ca       ON ca.gthr_id = g.gthr_id
LEFT JOIN my_attd ma        ON ma.gthr_id = g.gthr_id
WHERE g.team_id = p_team_id
  AND g.del_yn  = false
  AND (p_start IS NULL OR g.stt_at >= (p_start::timestamptz AT TIME ZONE 'Asia/Seoul'))
  AND (p_end   IS NULL OR g.stt_at <  ((p_end::timestamptz + interval '1 day') AT TIME ZONE 'Asia/Seoul'))
ORDER BY g.stt_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_gatherings(uuid, date, date, uuid)
  TO anon, authenticated, service_role;
