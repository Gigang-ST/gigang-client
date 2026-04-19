-- 팀·대회별 참가 표시 키(코스/응원/봉사/미정)별 인원 — 이름 없이 공개(비회원 UI용). SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.get_public_team_comp_reg_display_counts(
  p_team_id uuid,
  p_comp_id uuid
)
RETURNS TABLE (display_key text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.display_key, count(*)::bigint AS cnt
  FROM public.team_comp_plan_rel tcp
  INNER JOIN public.comp_reg_rel cr
    ON cr.team_comp_id = tcp.team_comp_id
    AND cr.vers = 0
    AND cr.del_yn = false
  LEFT JOIN public.comp_evt_cfg re
    ON re.comp_evt_id = cr.comp_evt_id
    AND re.vers = 0
    AND re.del_yn = false
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN cr.prt_role_cd = 'participant' THEN
          COALESCE(NULLIF(upper(trim(re.comp_evt_type::text)), ''), '미정')
        WHEN cr.prt_role_cd = 'cheering' THEN '응원'
        WHEN cr.prt_role_cd = 'volunteer' THEN '봉사'
        ELSE cr.prt_role_cd::text
      END AS display_key
  ) s
  WHERE tcp.team_id = p_team_id
    AND tcp.comp_id = p_comp_id
    AND tcp.vers = 0
    AND tcp.del_yn = false
  GROUP BY s.display_key;
$$;

COMMENT ON FUNCTION public.get_public_team_comp_reg_display_counts(uuid, uuid) IS
  '팀이 계획에 올린 대회의 comp_reg_rel을 표시 키(참가 코스·응원·봉사·미정)별로 집계. PII 없음.';

ALTER FUNCTION public.get_public_team_comp_reg_display_counts(uuid, uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_public_team_comp_reg_display_counts(uuid, uuid) TO anon, authenticated, service_role;
