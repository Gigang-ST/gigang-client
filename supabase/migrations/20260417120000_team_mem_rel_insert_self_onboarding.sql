-- 온보딩 신규 가입: mem_mst 정본이 있는 본인이 member 역할로 team_mem_rel 을 추가할 수 있게 한다.
-- team_mem_rel_insert_admin 은 owner/admin 만 INSERT 허용(20260407120000)이라
-- 일반 신규는 authenticated 만으로는 팀 합류 행을 넣을 수 없었다.
-- team_id 는 앱 서버(Host 기준 getRequestTeamContext)에서만 결정된다는 전제이며,
-- 클라이언트가 임의 team_id 로 직접 호출하면 삽입 가능하다는 한계는 동일하다.

CREATE POLICY team_mem_rel_insert_self_onboarding
  ON public.team_mem_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    mem_id = auth.uid()
    AND vers = 0
    AND del_yn = false
    AND team_role_cd = 'member'
    AND EXISTS (
      SELECT 1
      FROM public.mem_mst mm
      WHERE mm.mem_id = auth.uid()
        AND mm.vers = 0
        AND mm.del_yn = false
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mem_rel.team_id
        AND r.mem_id = auth.uid()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

COMMENT ON POLICY team_mem_rel_insert_self_onboarding ON public.team_mem_rel IS
  '온보딩: mem_mst 정본이 있는 본인의 member 팀 합류 INSERT (team_mem_rel_insert_admin 과 OR)';
