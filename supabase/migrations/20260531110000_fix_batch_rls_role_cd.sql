-- batch RLS 정책 수정: role_cd → team_role_cd IN ('admin','owner')
DROP POLICY IF EXISTS "batch_job_mst_admin_all" ON batch_job_mst;
DROP POLICY IF EXISTS "batch_run_hist_admin_all" ON batch_run_hist;

CREATE POLICY "batch_job_mst_admin_all" ON batch_job_mst
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_mem_rel r
      WHERE r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0 AND r.del_yn = false
    )
  );

CREATE POLICY "batch_run_hist_admin_all" ON batch_run_hist
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_mem_rel r
      WHERE r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0 AND r.del_yn = false
    )
  );
