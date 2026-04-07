-- 공개 팀 멤버 수 RPC 권한 보강:
-- p_team_id 임의 입력으로 타팀 집계를 조회하지 못하도록 anon/authenticated 실행 권한 제거.
-- 앱 서버(service_role) 경로만 허용한다.

REVOKE EXECUTE ON FUNCTION public.get_public_team_member_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_team_member_stats(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_team_member_stats(uuid) TO service_role;

COMMENT ON FUNCTION public.get_public_team_member_stats(uuid) IS
  '공개 홈 지표: 팀 활성/전체 멤버 수 집계 반환 (service_role 전용)';
