-- v2 백필 P4 전용: public.competition.event_types[] → public.comp_evt_cfg
-- 적용 순서: 20260404102203 직후, 20260404102205 직전 (당시 스키마는 컬럼명 `evt_cd` + 소문자 CHECK)
-- 후행: `20260404102205` 에서 `comp_evt_cd` 로 개명·대문자 규약·`cmm_cd_mst` COMP_EVT_CD 정합
-- 기준: database-schema-v2-migration-map.md §3.2 B)
-- 선행: P3(`comp_mst` 정본). `20260404102309` 가 `migration_v2_map_evt_cd` 를 DROP 하므로 본 파일에서 복구한다.

CREATE OR REPLACE FUNCTION public.migration_v2_map_evt_cd(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(btrim(coalesce(p_raw, '')))
    WHEN '5K' THEN '5k'
    WHEN '10K' THEN '10k'
    WHEN 'HALF' THEN 'half'
    WHEN 'FULL' THEN 'full'
    WHEN '50K' THEN '50k'
    WHEN '100K' THEN '100k'
    WHEN '100M' THEN '100m'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.migration_v2_map_evt_cd(text) IS 'v2 백필: AS-IS 종목 문자열 → comp_evt_cfg.evt_cd (migration-map §3.2 B)';

INSERT INTO public.comp_evt_cfg (comp_id, evt_cd, vers, del_yn, crt_at, upd_at)
SELECT DISTINCT
  c.id,
  public.migration_v2_map_evt_cd(et.raw_evt),
  0,
  false,
  c.created_at,
  coalesce(c.updated_at, c.created_at)
FROM public.competition c
INNER JOIN public.comp_mst m
  ON m.comp_id = c.id
 AND m.vers = 0
 AND m.del_yn = false
CROSS JOIN LATERAL unnest(coalesce(c.event_types, array[]::text[])) AS et(raw_evt)
WHERE public.migration_v2_map_evt_cd(et.raw_evt) IS NOT NULL
ON CONFLICT (comp_id, evt_cd, vers) DO NOTHING;

DO $$
DECLARE
  n_cfg bigint;
  n_unmap bigint;
BEGIN
  SELECT count(*) INTO n_cfg
  FROM public.comp_evt_cfg
  WHERE vers = 0 AND del_yn = false;

  SELECT count(*) INTO n_unmap
  FROM public.competition c
  INNER JOIN public.comp_mst m
    ON m.comp_id = c.id AND m.vers = 0 AND m.del_yn = false
  CROSS JOIN LATERAL unnest(coalesce(c.event_types, array[]::text[])) AS et(raw_evt)
  WHERE btrim(coalesce(et.raw_evt, '')) <> ''
    AND public.migration_v2_map_evt_cd(et.raw_evt) IS NULL;

  RAISE NOTICE 'v2_backfill_p4: comp_evt_cfg_rows=%, competition_event_array_unmapped_tokens=%', n_cfg, n_unmap;
END;
$$;
