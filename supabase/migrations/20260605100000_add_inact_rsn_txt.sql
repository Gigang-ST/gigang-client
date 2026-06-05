ALTER TABLE public.team_mem_rel
  ADD COLUMN inact_rsn_txt text;

COMMENT ON COLUMN public.team_mem_rel.inact_rsn_txt
  IS '비활성화 사유 (inactive 상태일 때만 의미 있음)';
