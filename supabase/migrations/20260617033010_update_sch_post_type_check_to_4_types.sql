-- [이력 이관 #713] prd 에만 기록돼 있던 마이그레이션(prd 버전·이름 동일).
-- prd 에는 이미 적용됐다 — 다시 적용하지 않는다. 저장소만으로 스키마를 재현하려고 파일로 옮긴 것(멱등).
SET lock_timeout = '3s';

ALTER TABLE public.sch_post_mst DROP CONSTRAINT IF EXISTS sch_post_post_type_check;
ALTER TABLE public.sch_post_mst ADD CONSTRAINT sch_post_post_type_check
  CHECK (post_type = ANY (ARRAY['general'::text, 'race_entry'::text, 'sale'::text, 'session'::text]));
