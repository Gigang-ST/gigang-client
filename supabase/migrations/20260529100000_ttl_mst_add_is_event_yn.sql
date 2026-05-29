ALTER TABLE public.ttl_mst
  ADD COLUMN IF NOT EXISTS is_event_yn boolean NOT NULL DEFAULT false;