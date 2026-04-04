-- v2 웨이브 5a: 회비 — enum·테이블·트리거 (fee_policy_cfg ~ fee_due_exm_hist)
-- 기준: .claude/docs/database-schema-v2-domains.md §4
-- 선행: 20260404081732_v2_wave2_member_team.sql
-- 후행: 20260404093853_v2_wave5_fee_snap_rls.sql

CREATE TYPE public.fee_txn_io_enm AS ENUM ('deposit', 'withdrawal');
CREATE TYPE public.fee_exm_tp_enm AS ENUM ('full', 'part');
CREATE TYPE public.fee_grant_src_enm AS ENUM ('manual', 'rule_attd');

COMMENT ON TYPE public.fee_txn_io_enm IS '회비 원시거래 입출금 (v2)';
COMMENT ON TYPE public.fee_exm_tp_enm IS '회비 면제 유형 (v2)';
COMMENT ON TYPE public.fee_grant_src_enm IS '회비 면제 반영 출처 (v2)';

CREATE TABLE public.fee_policy_cfg (
  fee_policy_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  aply_stt_dt date NOT NULL,
  aply_end_dt date NOT NULL,
  monthly_fee_amt bigint NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_policy_cfg PRIMARY KEY (fee_policy_id),
  CONSTRAINT fk_fee_policy_cfg__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT ck_fee_policy_cfg_monthly_fee_amt CHECK (monthly_fee_amt > 0),
  CONSTRAINT ck_fee_policy_cfg_aply_dt CHECK (aply_stt_dt <= aply_end_dt)
);

CREATE INDEX ix_fee_policy_cfg_team_id ON public.fee_policy_cfg (team_id);

CREATE TRIGGER fee_policy_cfg_set_upd_at
  BEFORE UPDATE ON public.fee_policy_cfg
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_policy_cfg IS '팀별 회비 단가·적용기간 (v2)';

CREATE TABLE public.fee_xlsx_upd_hist (
  upd_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  file_nm text NOT NULL,
  file_hash text NOT NULL,
  upd_by_mem_id uuid NOT NULL,
  upd_st_cd text NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_xlsx_upd_hist PRIMARY KEY (upd_id),
  CONSTRAINT fk_fee_xlsx_upd_hist__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_xlsx_upd_hist__mem_mst FOREIGN KEY (upd_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT uk_fee_xlsx_upd_hist_team_hash_vers UNIQUE (team_id, file_hash, vers),
  CONSTRAINT ck_fee_xlsx_upd_hist_upd_st_cd CHECK (
    upd_st_cd IN ('pending', 'confirmed', 'rolled_back')
  )
);

CREATE INDEX ix_fee_xlsx_upd_hist_team_id ON public.fee_xlsx_upd_hist (team_id);

CREATE TRIGGER fee_xlsx_upd_hist_set_upd_at
  BEFORE UPDATE ON public.fee_xlsx_upd_hist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_xlsx_upd_hist IS '회비 엑셀 업로드 이력 (v2)';

CREATE TABLE public.fee_txn_hist (
  txn_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  upd_id uuid NOT NULL,
  txn_dt date NOT NULL,
  txn_tm time without time zone,
  txn_amt bigint NOT NULL,
  txn_io_enm public.fee_txn_io_enm NOT NULL,
  raw_name text NOT NULL,
  raw_memo text,
  adm_memo_txt text,
  txn_tp_txt text NOT NULL,
  match_st_cd text NOT NULL,
  mem_id uuid,
  fee_item_cd text,
  is_cfm_yn boolean NOT NULL DEFAULT false,
  cfm_by_mem_id uuid,
  cfm_at timestamptz,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_txn_hist PRIMARY KEY (txn_id),
  CONSTRAINT fk_fee_txn_hist__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_txn_hist__fee_xlsx_upd_hist FOREIGN KEY (upd_id) REFERENCES public.fee_xlsx_upd_hist (upd_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_txn_hist__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT fk_fee_txn_hist__cfm_mem_mst FOREIGN KEY (cfm_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT uk_fee_txn_hist_dedup UNIQUE (team_id, txn_dt, txn_tm, txn_amt, raw_name),
  CONSTRAINT ck_fee_txn_hist_txn_amt CHECK (txn_amt > 0),
  CONSTRAINT ck_fee_txn_hist_match_st_cd CHECK (
    match_st_cd IN ('matched', 'unmatched', 'ambiguous')
  ),
  CONSTRAINT ck_fee_txn_hist_fee_item_cd CHECK (
    fee_item_cd IS NULL
    OR fee_item_cd IN ('due', 'expense', 'event_fee', 'goods', 'other')
  )
);

CREATE INDEX ix_fee_txn_hist_team_id ON public.fee_txn_hist (team_id);
CREATE INDEX ix_fee_txn_hist_upd_id ON public.fee_txn_hist (upd_id);
CREATE INDEX ix_fee_txn_hist_mem_id ON public.fee_txn_hist (mem_id);

CREATE TRIGGER fee_txn_hist_set_upd_at
  BEFORE UPDATE ON public.fee_txn_hist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_txn_hist IS '회비 은행 원시 거래 (v2)';

CREATE TABLE public.fee_due_pay_hist (
  pay_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  src_txn_id uuid,
  pay_amt bigint NOT NULL,
  pay_dt date NOT NULL,
  pay_st_cd text NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_due_pay_hist PRIMARY KEY (pay_id),
  CONSTRAINT fk_fee_due_pay_hist__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_due_pay_hist__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_due_pay_hist__fee_txn_hist FOREIGN KEY (src_txn_id) REFERENCES public.fee_txn_hist (txn_id) ON DELETE SET NULL,
  CONSTRAINT ck_fee_due_pay_hist_pay_st_cd CHECK (
    pay_st_cd IN ('paid', 'cancelled', 'refunded')
  ),
  CONSTRAINT ck_fee_due_pay_hist_pay_amt CHECK (pay_amt >= 0)
);

CREATE INDEX ix_fee_due_pay_hist_team_pay_dt ON public.fee_due_pay_hist (team_id, pay_dt);
CREATE INDEX ix_fee_due_pay_hist_mem_pay_dt ON public.fee_due_pay_hist (mem_id, pay_dt);

CREATE TRIGGER fee_due_pay_hist_set_upd_at
  BEFORE UPDATE ON public.fee_due_pay_hist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_due_pay_hist IS '확정 회비 납부 원장 (v2)';

CREATE TABLE public.fee_due_exm_cfg (
  exm_cfg_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  exm_tp_enm public.fee_exm_tp_enm NOT NULL,
  exm_amt bigint,
  aply_stt_dt date NOT NULL,
  aply_end_dt date NOT NULL,
  rsn_txt text NOT NULL,
  reg_by_mem_id uuid NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_due_exm_cfg PRIMARY KEY (exm_cfg_id),
  CONSTRAINT fk_fee_due_exm_cfg__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_due_exm_cfg__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_due_exm_cfg__reg_mem_mst FOREIGN KEY (reg_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT ck_fee_due_exm_cfg_aply_dt CHECK (aply_stt_dt <= aply_end_dt),
  CONSTRAINT ck_fee_due_exm_cfg_part_amt CHECK (
    exm_tp_enm <> 'part'::public.fee_exm_tp_enm OR exm_amt IS NOT NULL
  )
);

CREATE INDEX ix_fee_due_exm_cfg_team_mem ON public.fee_due_exm_cfg (team_id, mem_id);

CREATE TRIGGER fee_due_exm_cfg_set_upd_at
  BEFORE UPDATE ON public.fee_due_exm_cfg
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_due_exm_cfg IS '회비 면제 규칙 (v2)';

CREATE TABLE public.fee_due_exm_hist (
  exm_hist_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  exm_cfg_id uuid,
  aply_ym text NOT NULL,
  exm_amt bigint NOT NULL,
  grant_src_enm public.fee_grant_src_enm NOT NULL,
  rsn_txt text,
  aprv_by_mem_id uuid,
  aprv_at timestamptz,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_due_exm_hist PRIMARY KEY (exm_hist_id),
  CONSTRAINT fk_fee_due_exm_hist__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_due_exm_hist__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_due_exm_hist__exm_cfg FOREIGN KEY (exm_cfg_id) REFERENCES public.fee_due_exm_cfg (exm_cfg_id) ON DELETE SET NULL,
  CONSTRAINT fk_fee_due_exm_hist__aprv_mem_mst FOREIGN KEY (aprv_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT ck_fee_due_exm_hist_aply_ym CHECK (aply_ym ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

CREATE INDEX ix_fee_due_exm_hist_team_mem ON public.fee_due_exm_hist (team_id, mem_id);

CREATE TRIGGER fee_due_exm_hist_set_upd_at
  BEFORE UPDATE ON public.fee_due_exm_hist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.fee_due_exm_hist IS '회비 면제 적용 이력 (v2)';
