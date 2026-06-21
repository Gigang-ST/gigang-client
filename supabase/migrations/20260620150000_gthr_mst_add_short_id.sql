-- gthr_mst에 short_id 컬럼 추가 (nanoid 기반 딥링크용)
ALTER TABLE public.gthr_mst
  ADD COLUMN IF NOT EXISTS short_id text NOT NULL DEFAULT generate_nanoid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_gthr_mst_short_id ON public.gthr_mst(short_id);

COMMENT ON COLUMN public.gthr_mst.short_id IS 'nanoid 기반 공유/딥링크용 단축 ID';
