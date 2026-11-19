-- 회비 개시잔액 조정 이력(#704) — 앵커(개시잔액)에 녹아 있는 레거시를 사실에 맞게 바로잡는 관리자 조정.
--
-- - adj_amt: 잔액에 더할 값(+/-, 0 제외). 재계산(recalculateBalance)이 baseBal 에 "앵커 이후 생성된 유효 조정 합"을 더한다.
-- - 되돌리기: 행을 지우지 않고 del_yn=true + rvt_* 로 남긴다(감사 기록 유지). 되돌린 뒤 재계산하면 잔액이 원복된다.
-- - 접근: 서버 액션(service role)만. RLS 켜고 정책은 두지 않는다(회원·익명 접근 차단).

SET lock_timeout = '3s';

CREATE TABLE public.fee_bal_adj_hist (
  adj_id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mem_id uuid NOT NULL,
  adj_amt bigint NOT NULL,
  rsn_txt text NOT NULL,
  adj_by_mem_id uuid NOT NULL,
  rvt_by_mem_id uuid,
  rvt_at timestamptz,
  rvt_rsn_txt text,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_fee_bal_adj_hist PRIMARY KEY (adj_id),
  CONSTRAINT fk_fee_bal_adj_hist__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_bal_adj_hist__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_bal_adj_hist__adj_by FOREIGN KEY (adj_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_bal_adj_hist__rvt_by FOREIGN KEY (rvt_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT ck_fee_bal_adj_hist_amt_nonzero CHECK (adj_amt <> 0),
  CONSTRAINT ck_fee_bal_adj_hist_rsn_nonblank CHECK (length(btrim(rsn_txt)) > 0)
);

CREATE INDEX ix_fee_bal_adj_hist_team_mem ON public.fee_bal_adj_hist (team_id, mem_id);

CREATE TRIGGER fee_bal_adj_hist_set_upd_at
  BEFORE UPDATE ON public.fee_bal_adj_hist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

ALTER TABLE public.fee_bal_adj_hist ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fee_bal_adj_hist IS '회비 개시잔액 조정 이력 — 관리자 조정(사유 필수)·되돌리기는 del_yn+rvt_* (#704)';
