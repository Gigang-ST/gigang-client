-- 회비 프로젝트(모금) 마스터 — SP2 프로젝트별 추적.
-- 단체복·야유회 같은 프로젝트성 모금(fee_item_cd='event_fee') 입금을 특정 프로젝트에
-- 귀속시켜 프로젝트별 참여자 명단·모금액을 집계한다.
-- fee_txn_hist.project_id 는 P1(20260701120000)에서 선행 추가된 컬럼 — 여기서 FK 를 붙인다.
-- 패턴 준거: 20260701120000_fee_payer_alias.sql (RLS admin FOR ALL + service_role 앱 접근)

CREATE TABLE public.fee_prj_mst (
  prj_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  prj_nm text NOT NULL,
  st_cd text NOT NULL DEFAULT 'active',
  memo_txt text,
  created_by uuid,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_prj_mst PRIMARY KEY (prj_id),
  CONSTRAINT fk_fee_prj_mst__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_prj_mst__crt_mem_mst FOREIGN KEY (created_by) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT ck_fee_prj_mst_prj_nm CHECK (length(prj_nm) > 0),
  CONSTRAINT ck_fee_prj_mst_st_cd CHECK (st_cd IN ('active', 'closed'))
);

-- 활성 프로젝트 이름은 팀 내 유일(del_yn=true 과거는 재사용 허용)
CREATE UNIQUE INDEX uk_fee_prj_mst_team_nm
  ON public.fee_prj_mst (team_id, prj_nm)
  WHERE del_yn = false;

CREATE INDEX ix_fee_prj_mst_team_id ON public.fee_prj_mst (team_id);

CREATE TRIGGER fee_prj_mst_set_upd_at
  BEFORE UPDATE ON public.fee_prj_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_prj_mst IS '회비 프로젝트(모금) 마스터 — 프로젝트성 입금 귀속·집계 (SP2)';
COMMENT ON COLUMN public.fee_prj_mst.st_cd IS 'active=모금 중(인박스 선택지 노출) | closed=마감';

ALTER TABLE public.fee_prj_mst ENABLE ROW LEVEL SECURITY;

-- 앱 읽기/쓰기는 전부 service_role admin 클라이언트 경유. 관리자 직접 접근만 열어둔다.
CREATE POLICY fee_prj_mst_mutate_admin
  ON public.fee_prj_mst FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_prj_mst.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_mem_rel r
    WHERE r.team_id = fee_prj_mst.team_id AND r.mem_id = auth.uid()
      AND r.team_role_cd IN ('owner', 'admin') AND r.vers = 0 AND r.del_yn = false));

GRANT ALL ON TABLE public.fee_prj_mst TO anon;
GRANT ALL ON TABLE public.fee_prj_mst TO authenticated;
GRANT ALL ON TABLE public.fee_prj_mst TO service_role;

-- P1 선행 컬럼에 FK·인덱스 연결 (프로젝트 삭제 시 거래 귀속만 해제)
ALTER TABLE public.fee_txn_hist
  ADD CONSTRAINT fk_fee_txn_hist__fee_prj_mst FOREIGN KEY (project_id)
  REFERENCES public.fee_prj_mst (prj_id) ON DELETE SET NULL;

CREATE INDEX ix_fee_txn_hist_project_id
  ON public.fee_txn_hist (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.fee_txn_hist.project_id IS '프로젝트성 모금 귀속 (fee_prj_mst.prj_id, SP2)';
