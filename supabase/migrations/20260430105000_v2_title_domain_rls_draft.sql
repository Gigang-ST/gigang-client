-- v2 칭호 도메인 RLS 초안
-- 대상: public.ttl_mst, public.mem_ttl_rel
-- 기준: .claude/docs/database-schema-v2-title-domain.md §8

-- ---------------------------------------------------------------------------
-- RLS 활성화
-- ---------------------------------------------------------------------------
ALTER TABLE public.ttl_mst ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mem_ttl_rel ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- ttl_mst: 팀원 조회, 관리자 CUD
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ttl_mst_select_member ON public.ttl_mst;
CREATE POLICY ttl_mst_select_member
  ON public.ttl_mst
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = ttl_mst.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

DROP POLICY IF EXISTS ttl_mst_mutate_admin ON public.ttl_mst;
CREATE POLICY ttl_mst_mutate_admin
  ON public.ttl_mst
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = ttl_mst.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = ttl_mst.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- ---------------------------------------------------------------------------
-- mem_ttl_rel: 팀원 조회, 관리자 수여/수정/회수
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS mem_ttl_rel_select_member ON public.mem_ttl_rel;
CREATE POLICY mem_ttl_rel_select_member
  ON public.mem_ttl_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = mem_ttl_rel.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

DROP POLICY IF EXISTS mem_ttl_rel_mutate_admin ON public.mem_ttl_rel;
CREATE POLICY mem_ttl_rel_mutate_admin
  ON public.mem_ttl_rel
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = mem_ttl_rel.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = mem_ttl_rel.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- ---------------------------------------------------------------------------
-- 참고
-- - 자동 부여 서버 액션은 service_role 경로를 사용한다(서비스 롤은 RLS 우회).
-- - 필요 시 자동 부여 전용 RPC를 SECURITY DEFINER로 분리해 권한 경계를 더 명확히 할 수 있다.
-- ---------------------------------------------------------------------------
