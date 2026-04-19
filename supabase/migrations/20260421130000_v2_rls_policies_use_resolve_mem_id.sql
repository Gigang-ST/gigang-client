-- 레거시 회원: mem_mst.mem_id ≠ auth.uid() 이고 oauth_kakao_id/oauth_google_id = auth.uid()
-- team_mem_rel.comp_reg_rel 등은 mem_id가 정본 PK라 RLS에서 auth.uid()와 직접 비교하면 실패한다.
-- public.v2_rls_resolve_mem_id() (20260418130000)로 현재 세션의 정본 mem_id를 통일해 비교한다.

REVOKE ALL ON FUNCTION public.v2_rls_resolve_mem_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v2_rls_resolve_mem_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- mem_utmb_prf: 본인 CUD
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS mem_utmb_prf_insert_own ON public.mem_utmb_prf;
CREATE POLICY mem_utmb_prf_insert_own
  ON public.mem_utmb_prf
  FOR INSERT
  TO authenticated
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id());

DROP POLICY IF EXISTS mem_utmb_prf_update_own ON public.mem_utmb_prf;
CREATE POLICY mem_utmb_prf_update_own
  ON public.mem_utmb_prf
  FOR UPDATE
  TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id() AND del_yn = false)
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id());

DROP POLICY IF EXISTS mem_utmb_prf_delete_own ON public.mem_utmb_prf;
CREATE POLICY mem_utmb_prf_delete_own
  ON public.mem_utmb_prf
  FOR DELETE
  TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

-- ---------------------------------------------------------------------------
-- team_mem_rel: 본인 행 UPDATE + 온보딩 INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_mem_rel_update_admin_or_self ON public.team_mem_rel;
CREATE POLICY team_mem_rel_update_admin_or_self
  ON public.team_mem_rel
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND (
      mem_id = public.v2_rls_resolve_mem_id()
      OR public.v2_rls_auth_team_owner_or_admin(team_id)
    )
  )
  WITH CHECK (
    public.v2_rls_auth_team_owner_or_admin(team_id)
    OR mem_id = public.v2_rls_resolve_mem_id()
  );

DROP POLICY IF EXISTS team_mem_rel_insert_self_onboarding ON public.team_mem_rel;
CREATE POLICY team_mem_rel_insert_self_onboarding
  ON public.team_mem_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND vers = 0
    AND del_yn = false
    AND team_role_cd = 'member'
    AND EXISTS (
      SELECT 1
      FROM public.mem_mst mm
      WHERE mm.mem_id = team_mem_rel.mem_id
        AND mm.vers = 0
        AND mm.del_yn = false
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_mem_rel.team_id
        AND r.mem_id = team_mem_rel.mem_id
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

COMMENT ON POLICY team_mem_rel_insert_self_onboarding ON public.team_mem_rel IS
  '온보딩: v2_rls_resolve_mem_id()와 일치하는 mem_id의 member 팀 합류 INSERT';

-- ---------------------------------------------------------------------------
-- team_comp_plan_rel: 소속·관리자·팀원 INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_comp_plan_rel_select_member ON public.team_comp_plan_rel;
CREATE POLICY team_comp_plan_rel_select_member
  ON public.team_comp_plan_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_comp_plan_rel.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

DROP POLICY IF EXISTS team_comp_plan_rel_mutate_admin ON public.team_comp_plan_rel;
CREATE POLICY team_comp_plan_rel_mutate_admin
  ON public.team_comp_plan_rel
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_comp_plan_rel.team_id
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
      WHERE r.team_id = team_comp_plan_rel.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

DROP POLICY IF EXISTS team_comp_plan_rel_insert_teammate ON public.team_comp_plan_rel;
CREATE POLICY team_comp_plan_rel_insert_teammate
  ON public.team_comp_plan_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    vers = 0
    AND del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.team_id = team_comp_plan_rel.team_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- ---------------------------------------------------------------------------
-- comp_reg_rel
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS comp_reg_rel_select_teammate ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_select_teammate
  ON public.comp_reg_rel
  FOR SELECT
  TO authenticated
  USING (
    del_yn = false
    AND EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

DROP POLICY IF EXISTS comp_reg_rel_insert_self_member ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_insert_self_member
  ON public.comp_reg_rel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

DROP POLICY IF EXISTS comp_reg_rel_update_self_or_team_admin ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_update_self_or_team_admin
  ON public.comp_reg_rel
  FOR UPDATE
  TO authenticated
  USING (
    del_yn = false
    AND (
      mem_id = public.v2_rls_resolve_mem_id()
      OR EXISTS (
        SELECT 1
        FROM public.team_comp_plan_rel tcp
        INNER JOIN public.team_mem_rel r
          ON r.team_id = tcp.team_id
        WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
          AND r.mem_id = public.v2_rls_resolve_mem_id()
          AND r.team_role_cd IN ('owner', 'admin')
          AND tcp.vers = 0
          AND tcp.del_yn = false
          AND r.vers = 0
          AND r.del_yn = false
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
    OR mem_id = public.v2_rls_resolve_mem_id()
  );

DROP POLICY IF EXISTS comp_reg_rel_delete_self_or_team_admin ON public.comp_reg_rel;
CREATE POLICY comp_reg_rel_delete_self_or_team_admin
  ON public.comp_reg_rel
  FOR DELETE
  TO authenticated
  USING (
    mem_id = public.v2_rls_resolve_mem_id()
    OR EXISTS (
      SELECT 1
      FROM public.team_comp_plan_rel tcp
      INNER JOIN public.team_mem_rel r
        ON r.team_id = tcp.team_id
      WHERE tcp.team_comp_id = comp_reg_rel.team_comp_id
        AND r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_role_cd IN ('owner', 'admin')
        AND tcp.vers = 0
        AND tcp.del_yn = false
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- ---------------------------------------------------------------------------
-- 기강 팀 관리자: comp_mst / comp_evt_cfg CUD
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS comp_mst_mutate_team_admin ON public.comp_mst;
CREATE POLICY comp_mst_mutate_team_admin
  ON public.comp_mst
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = public.v2_rls_resolve_mem_id()
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
      WHERE r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

DROP POLICY IF EXISTS comp_evt_cfg_mutate_team_admin ON public.comp_evt_cfg;
CREATE POLICY comp_evt_cfg_mutate_team_admin
  ON public.comp_evt_cfg
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_mem_rel r
      WHERE r.mem_id = public.v2_rls_resolve_mem_id()
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
      WHERE r.mem_id = public.v2_rls_resolve_mem_id()
        AND r.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
        AND r.team_role_cd IN ('owner', 'admin')
        AND r.vers = 0
        AND r.del_yn = false
    )
  );

-- ---------------------------------------------------------------------------
-- 회비 fee_* (team_mem_rel 소속·관리자 검사)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS fee_policy_cfg_select_member ON public.fee_policy_cfg;
CREATE POLICY fee_policy_cfg_select_member
  ON public.fee_policy_cfg FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_policy_cfg.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_xlsx_upd_hist_select_member ON public.fee_xlsx_upd_hist;
CREATE POLICY fee_xlsx_upd_hist_select_member
  ON public.fee_xlsx_upd_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_xlsx_upd_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_txn_hist_select_member ON public.fee_txn_hist;
CREATE POLICY fee_txn_hist_select_member
  ON public.fee_txn_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_txn_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_due_pay_hist_select_member ON public.fee_due_pay_hist;
CREATE POLICY fee_due_pay_hist_select_member
  ON public.fee_due_pay_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_pay_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_due_exm_cfg_select_member ON public.fee_due_exm_cfg;
CREATE POLICY fee_due_exm_cfg_select_member
  ON public.fee_due_exm_cfg FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_cfg.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_due_exm_hist_select_member ON public.fee_due_exm_hist;
CREATE POLICY fee_due_exm_hist_select_member
  ON public.fee_due_exm_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_mem_bal_snap_select_member ON public.fee_mem_bal_snap;
CREATE POLICY fee_mem_bal_snap_select_member
  ON public.fee_mem_bal_snap FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_mem_bal_snap.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_policy_cfg_mutate_admin ON public.fee_policy_cfg;
CREATE POLICY fee_policy_cfg_mutate_admin
  ON public.fee_policy_cfg FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_policy_cfg.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_policy_cfg.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_xlsx_upd_hist_mutate_admin ON public.fee_xlsx_upd_hist;
CREATE POLICY fee_xlsx_upd_hist_mutate_admin
  ON public.fee_xlsx_upd_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_xlsx_upd_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_xlsx_upd_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_txn_hist_mutate_admin ON public.fee_txn_hist;
CREATE POLICY fee_txn_hist_mutate_admin
  ON public.fee_txn_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_txn_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_txn_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_due_pay_hist_mutate_admin ON public.fee_due_pay_hist;
CREATE POLICY fee_due_pay_hist_mutate_admin
  ON public.fee_due_pay_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_pay_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_pay_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_due_exm_cfg_mutate_admin ON public.fee_due_exm_cfg;
CREATE POLICY fee_due_exm_cfg_mutate_admin
  ON public.fee_due_exm_cfg FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_cfg.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_cfg.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_due_exm_hist_mutate_admin ON public.fee_due_exm_hist;
CREATE POLICY fee_due_exm_hist_mutate_admin
  ON public.fee_due_exm_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_hist.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

DROP POLICY IF EXISTS fee_mem_bal_snap_mutate_admin ON public.fee_mem_bal_snap;
CREATE POLICY fee_mem_bal_snap_mutate_admin
  ON public.fee_mem_bal_snap FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_mem_bal_snap.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_mem_bal_snap.team_id AND r.mem_id = public.v2_rls_resolve_mem_id()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));
