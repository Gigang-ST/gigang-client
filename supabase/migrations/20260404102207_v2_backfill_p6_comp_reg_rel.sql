-- v2 백필 P6 전용: public.competition_registration → public.comp_reg_rel
-- 적용 순서: 20260404102206 직후, 20260404102309 직전
-- 기준: database-schema-v2-migration-map.md §3.3 B) — comp_reg_id = AS-IS id 1:1
-- 선행: P5(`team_comp_plan_rel`), P1(`mem_mst`), P4+02205(`comp_evt_cfg.comp_evt_cd`)
--
-- `20260404102309` 적용 후에는 `migration_v2_map_evt_cd` 가 DROP 될 수 있으므로 본 파일에서 복구한다.

CREATE OR REPLACE FUNCTION public.migration_v2_map_evt_cd(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(btrim(coalesce(p_raw, '')))
    WHEN '5K' THEN '5K'
    WHEN '10K' THEN '10K'
    WHEN 'HALF' THEN 'HALF'
    WHEN 'FULL' THEN 'FULL'
    WHEN '50K' THEN '50K'
    WHEN '100K' THEN '100K'
    WHEN '100M' THEN '100M'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.migration_v2_map_evt_cd(text) IS 'v2 백필: AS-IS 종목 문자열 → comp_evt_cfg.comp_evt_cd (COMP_EVT_CD 규약)';

INSERT INTO public.comp_reg_rel (
  comp_reg_id,
  team_comp_id,
  mem_id,
  comp_evt_id,
  prt_role_cd,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  cr.id,
  tcp.team_comp_id,
  cr.member_id,
  e.comp_evt_id,
  cr.role::text,
  0,
  false,
  cr.created_at,
  coalesce(cr.updated_at, cr.created_at)
FROM public.competition_registration cr
INNER JOIN public.mem_mst mm
  ON mm.mem_id = cr.member_id
 AND mm.vers = 0
 AND mm.del_yn = false
INNER JOIN public.team_comp_plan_rel tcp
  ON tcp.comp_id = cr.competition_id
 AND tcp.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
 AND tcp.vers = 0
 AND tcp.del_yn = false
LEFT JOIN public.comp_evt_cfg e
  ON e.comp_id = cr.competition_id
 AND e.comp_evt_cd = public.migration_v2_map_evt_cd(cr.event_type)
 AND e.vers = 0
 AND e.del_yn = false
WHERE NOT EXISTS (
  SELECT 1 FROM public.comp_reg_rel x WHERE x.comp_reg_id = cr.id
);

DO $$
DECLARE
  n_cr bigint;
  n_rel bigint;
BEGIN
  SELECT count(*) INTO n_cr FROM public.competition_registration;
  SELECT count(*) INTO n_rel
  FROM public.comp_reg_rel
  WHERE vers = 0 AND del_yn = false;

  RAISE NOTICE 'v2_backfill_p6: competition_registration_cnt=%, comp_reg_rel_canonical=%', n_cr, n_rel;
END;
$$;
