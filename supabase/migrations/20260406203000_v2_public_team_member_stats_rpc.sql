-- 공개 홈 지표용 RPC: 팀 멤버 활성/전체 수만 반환
-- 원본 team_mem_rel 행은 노출하지 않고 집계값만 공개한다.

CREATE OR REPLACE FUNCTION public.get_public_team_member_stats(p_team_id uuid)
RETURNS TABLE (
  active_count bigint,
  total_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (
      WHERE mem_st_cd = 'active'
    )::bigint AS active_count,
    count(*)::bigint AS total_count
  FROM public.team_mem_rel
  WHERE team_id = p_team_id
    AND vers = 0
    AND del_yn = false;
$$;

REVOKE ALL ON FUNCTION public.get_public_team_member_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_team_member_stats(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_team_member_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_team_member_stats(uuid) TO service_role;

COMMENT ON FUNCTION public.get_public_team_member_stats(uuid) IS
  '공개 홈 지표: 팀 활성/전체 멤버 수 집계 반환';

