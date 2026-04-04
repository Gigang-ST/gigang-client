-- v2 웨이브 5b: 회비 — 잔액 스냅샷 + RLS + GRANT
-- 선행: 20260404093618_v2_wave5_fee_core.sql

CREATE TABLE public.fee_mem_bal_snap (
  bal_snap_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  bal_amt bigint NOT NULL,
  last_calc_dt date NOT NULL,
  last_calc_at timestamptz NOT NULL,
  last_ref_pay_id uuid,
  last_ref_exm_hist_id uuid,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_mem_bal_snap PRIMARY KEY (bal_snap_id),
  CONSTRAINT fk_fee_mem_bal_snap__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_mem_bal_snap__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_mem_bal_snap__pay FOREIGN KEY (last_ref_pay_id) REFERENCES public.fee_due_pay_hist (pay_id) ON DELETE SET NULL,
  CONSTRAINT fk_fee_mem_bal_snap__exm_hist FOREIGN KEY (last_ref_exm_hist_id) REFERENCES public.fee_due_exm_hist (exm_hist_id) ON DELETE SET NULL,
  CONSTRAINT uk_fee_mem_bal_snap_team_mem_vers UNIQUE (team_id, mem_id, vers)
);

CREATE INDEX ix_fee_mem_bal_snap_team_id ON public.fee_mem_bal_snap (team_id);
CREATE INDEX ix_fee_mem_bal_snap_mem_id ON public.fee_mem_bal_snap (mem_id);

CREATE TRIGGER fee_mem_bal_snap_set_upd_at
  BEFORE UPDATE ON public.fee_mem_bal_snap
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_mem_bal_snap IS '회원별 회비 잔액 스냅샷 (v2)';

ALTER TABLE public.fee_policy_cfg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_xlsx_upd_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_txn_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_due_pay_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_due_exm_cfg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_due_exm_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_mem_bal_snap ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_policy_cfg_select_member
  ON public.fee_policy_cfg FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_policy_cfg.team_id AND r.mem_id = auth.uid()
      AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_xlsx_upd_hist_select_member
  ON public.fee_xlsx_upd_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_xlsx_upd_hist.team_id AND r.mem_id = auth.uid()
      AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_txn_hist_select_member
  ON public.fee_txn_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_txn_hist.team_id AND r.mem_id = auth.uid()
      AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_due_pay_hist_select_member
  ON public.fee_due_pay_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_pay_hist.team_id AND r.mem_id = auth.uid()
      AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_due_exm_cfg_select_member
  ON public.fee_due_exm_cfg FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_cfg.team_id AND r.mem_id = auth.uid()
      AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_due_exm_hist_select_member
  ON public.fee_due_exm_hist FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_hist.team_id AND r.mem_id = auth.uid()
      AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_mem_bal_snap_select_member
  ON public.fee_mem_bal_snap FOR SELECT TO authenticated
  USING (del_yn = false AND EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_mem_bal_snap.team_id AND r.mem_id = auth.uid()
      AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_policy_cfg_mutate_admin
  ON public.fee_policy_cfg FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_policy_cfg.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_policy_cfg.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_xlsx_upd_hist_mutate_admin
  ON public.fee_xlsx_upd_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_xlsx_upd_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_xlsx_upd_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_txn_hist_mutate_admin
  ON public.fee_txn_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_txn_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_txn_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_due_pay_hist_mutate_admin
  ON public.fee_due_pay_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_pay_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_pay_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_due_exm_cfg_mutate_admin
  ON public.fee_due_exm_cfg FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_cfg.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_cfg.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_due_exm_hist_mutate_admin
  ON public.fee_due_exm_hist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_due_exm_hist.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

CREATE POLICY fee_mem_bal_snap_mutate_admin
  ON public.fee_mem_bal_snap FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_mem_bal_snap.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_mem_bal_snap.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

GRANT ALL ON TABLE public.fee_policy_cfg TO anon;
GRANT ALL ON TABLE public.fee_policy_cfg TO authenticated;
GRANT ALL ON TABLE public.fee_policy_cfg TO service_role;

GRANT ALL ON TABLE public.fee_xlsx_upd_hist TO anon;
GRANT ALL ON TABLE public.fee_xlsx_upd_hist TO authenticated;
GRANT ALL ON TABLE public.fee_xlsx_upd_hist TO service_role;

GRANT ALL ON TABLE public.fee_txn_hist TO anon;
GRANT ALL ON TABLE public.fee_txn_hist TO authenticated;
GRANT ALL ON TABLE public.fee_txn_hist TO service_role;

GRANT ALL ON TABLE public.fee_due_pay_hist TO anon;
GRANT ALL ON TABLE public.fee_due_pay_hist TO authenticated;
GRANT ALL ON TABLE public.fee_due_pay_hist TO service_role;

GRANT ALL ON TABLE public.fee_due_exm_cfg TO anon;
GRANT ALL ON TABLE public.fee_due_exm_cfg TO authenticated;
GRANT ALL ON TABLE public.fee_due_exm_cfg TO service_role;

GRANT ALL ON TABLE public.fee_due_exm_hist TO anon;
GRANT ALL ON TABLE public.fee_due_exm_hist TO authenticated;
GRANT ALL ON TABLE public.fee_due_exm_hist TO service_role;

GRANT ALL ON TABLE public.fee_mem_bal_snap TO anon;
GRANT ALL ON TABLE public.fee_mem_bal_snap TO authenticated;
GRANT ALL ON TABLE public.fee_mem_bal_snap TO service_role;
