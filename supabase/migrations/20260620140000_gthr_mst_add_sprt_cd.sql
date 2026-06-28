-- gthr_mst에 종목 컬럼 추가
ALTER TABLE public.gthr_mst
  ADD COLUMN IF NOT EXISTS sprt_cd text DEFAULT NULL;

COMMENT ON COLUMN public.gthr_mst.sprt_cd IS '모임 종목 (running, trail_run, swimming, cycling 등 자유값, NULL=미지정)';
