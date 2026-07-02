-- 회비 매칭 학습: 입금자명(정규화) → 회원 매핑. 다음 업로드부터 자동 매칭.
-- 기준: docs/superpowers/specs/2026-07-01-회비관리-ux-design.md §4
-- 선행: 20260404093853_v2_wave5_fee_snap_rls.sql

CREATE TABLE public.fee_payer_alias (
  alias_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  raw_name_norm text NOT NULL,
  mem_id uuid NOT NULL,
  hit_cnt integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_payer_alias PRIMARY KEY (alias_id),
  CONSTRAINT fk_fee_payer_alias__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_payer_alias__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_payer_alias__crt_mem_mst FOREIGN KEY (created_by) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT ck_fee_payer_alias_raw_name_norm CHECK (length(raw_name_norm) > 0)
);

-- 활성 별칭은 (팀, 정규화이름) 당 1건. del_yn=true(과거)는 제외해 재학습 허용.
CREATE UNIQUE INDEX uk_fee_payer_alias_team_norm
  ON public.fee_payer_alias (team_id, raw_name_norm)
  WHERE del_yn = false;

CREATE INDEX ix_fee_payer_alias_team_id ON public.fee_payer_alias (team_id);
CREATE INDEX ix_fee_payer_alias_mem_id ON public.fee_payer_alias (mem_id);

CREATE TRIGGER fee_payer_alias_set_upd_at
  BEFORE UPDATE ON public.fee_payer_alias
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_payer_alias IS '회비 입금자명→회원 매칭 학습 (P1)';

ALTER TABLE public.fee_payer_alias ENABLE ROW LEVEL SECURITY;

-- 별칭(입금자명→회원 매핑)은 관리자 운영 데이터라 일반 멤버 SELECT를 열지 않는다.
-- 앱의 읽기는 전부 service_role admin 클라이언트(RLS 우회)로만 하고,
-- 아래 mutate_admin(FOR ALL)이 관리자 SELECT까지 커버한다.
CREATE POLICY fee_payer_alias_mutate_admin
  ON public.fee_payer_alias FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_payer_alias.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_payer_alias.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

GRANT ALL ON TABLE public.fee_payer_alias TO anon;
GRANT ALL ON TABLE public.fee_payer_alias TO authenticated;
GRANT ALL ON TABLE public.fee_payer_alias TO service_role;

-- P2(프로젝트 모금) 대비 선행 컬럼. P1 미사용(항상 NULL).
ALTER TABLE public.fee_txn_hist
  ADD COLUMN IF NOT EXISTS project_id uuid;

COMMENT ON COLUMN public.fee_txn_hist.project_id IS '프로젝트성 모금 연결 (P2, P1 미사용)';
