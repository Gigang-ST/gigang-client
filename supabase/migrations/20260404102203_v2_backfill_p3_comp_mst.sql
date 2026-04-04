-- v2 백필 P3 전용: public.competition → public.comp_mst
-- 적용 순서: 20260404102202 직후, 20260404102309 이전
-- 기준: database-schema-v2-migration-map.md §3.2 A)
--
-- P4(`comp_evt_cfg`)·P5(`team_comp_plan_rel`)는 별도 마이그레이션에서 수행한다.

INSERT INTO public.comp_mst (
  comp_id,
  comp_sprt_cd,
  comp_nm,
  stt_dt,
  end_dt,
  loc_nm,
  src_url,
  ext_id,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  c.id,
  CASE lower(btrim(coalesce(c.sport, '')))
    WHEN 'road' THEN 'road_run'
    WHEN 'road_run' THEN 'road_run'
    WHEN 'trail' THEN 'trail_run'
    WHEN 'trail_run' THEN 'trail_run'
    WHEN 'triathlon' THEN 'triathlon'
    WHEN 'cycling' THEN 'cycling'
    ELSE NULL
  END,
  c.title,
  c.start_date,
  c.end_date,
  c.location,
  c.source_url,
  c.external_id,
  0,
  false,
  c.created_at,
  coalesce(c.updated_at, c.created_at)
FROM public.competition c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.comp_mst x
  WHERE x.comp_id = c.id
    AND x.vers = 0
    AND x.del_yn = false
);

DO $$
DECLARE
  n_comp bigint;
  n_mst bigint;
BEGIN
  SELECT count(*) INTO n_comp FROM public.competition;
  SELECT count(*) INTO n_mst
  FROM public.comp_mst
  WHERE vers = 0 AND del_yn = false;

  RAISE NOTICE 'v2_backfill_p3: competition_cnt=%, comp_mst_canonical=%', n_comp, n_mst;
END;
$$;
