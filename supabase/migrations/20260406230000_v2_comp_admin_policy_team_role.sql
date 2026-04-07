-- v2 컷오버: comp_mst/comp_evt_cfg 관리자 정책을 member 기반에서 team_mem_rel 기반으로 전환

DROP POLICY IF EXISTS comp_mst_mutate_legacy_admin ON public.comp_mst;
DROP POLICY IF EXISTS comp_evt_cfg_mutate_legacy_admin ON public.comp_evt_cfg;

DROP FUNCTION IF EXISTS public.is_legacy_platform_admin();

CREATE POLICY comp_mst_mutate_team_admin
  ON public.comp_mst
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = auth.uid()
        AND r.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = auth.uid()
        AND r.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

CREATE POLICY comp_evt_cfg_mutate_team_admin
  ON public.comp_evt_cfg
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = auth.uid()
        AND r.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = auth.uid()
        AND r.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );
