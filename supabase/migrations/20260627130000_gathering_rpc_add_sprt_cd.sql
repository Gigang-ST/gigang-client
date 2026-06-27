-- 모임 종목(sprt_cd) 노출: 컬럼 보강 + get_public_team_gatherings RPC 반환에 sprt_cd 추가
-- 캘린더/리스트뷰 모임 항목에 종목 태그를 표시하기 위함.
-- prd에는 모임 기능(gthr_mst)이 아직 미반영이므로 dev에만 적용. prd 배포 시 모임 마이그레이션과 함께 적용.
-- IF NOT EXISTS로 sprt_cd 컬럼 보강(dev는 이미 존재 → 무시).

ALTER TABLE public.gthr_mst ADD COLUMN IF NOT EXISTS sprt_cd text;

-- RETURNS TABLE 시그니처 변경이라 DROP 후 재생성
DROP FUNCTION IF EXISTS public.get_public_team_gatherings(uuid, date, date, uuid);

CREATE FUNCTION public.get_public_team_gatherings(
  p_team_id uuid,
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_mem_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  gthr_id uuid, short_id text, gthr_nm text, gthr_type_enm text, sprt_cd text,
  stt_at timestamp with time zone, end_at timestamp with time zone,
  loc_txt text, desc_txt text, crt_by uuid, crt_by_nm text,
  attd_count bigint, cmnt_count bigint, is_attending boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  g.sprt_cd,
  g.stt_at,
  g.end_at,
  g.loc_txt,
  g.desc_txt,
  g.crt_by,
  m.mem_nm                                   AS crt_by_nm,
  COALESCE(aa.attd_count, 0)                 AS attd_count,
  COALESCE(ca.cmnt_count, 0)                 AS cmnt_count,
  CASE WHEN p_mem_id IS NULL THEN false
       ELSE ma.gthr_id IS NOT NULL
  END                                        AS is_attending
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
$function$;
