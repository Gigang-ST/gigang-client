-- v2 백필 P6–P8: comp_reg_rel, rec_race_hist, fee_policy_cfg + 임시 함수 제거
-- 선행: 20260404102200_v2_backfill_p0_p5.sql

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

INSERT INTO public.rec_race_hist (
  race_result_id,
  mem_id,
  comp_id,
  comp_evt_id,
  rec_time_sec,
  race_nm,
  race_dt,
  swim_time_sec,
  bike_time_sec,
  run_time_sec,
  rec_src_cd,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  rr.id,
  rr.member_id,
  cm.comp_id,
  e.comp_evt_id,
  rr.record_time_sec,
  rr.race_name::text,
  rr.race_date,
  rr.swim_time_sec,
  rr.bike_time_sec,
  rr.run_time_sec,
  'manual'::text,
  0,
  false,
  rr.created_at,
  rr.created_at
  -- public.race_result: 스키마에 updated_at 없음 → upd_at = created_at (20260325091708_remote_schema.sql 기준)
FROM public.race_result rr
INNER JOIN public.mem_mst mm
  ON mm.mem_id = rr.member_id
 AND mm.vers = 0
 AND mm.del_yn = false
LEFT JOIN LATERAL (
  SELECT c.comp_id
  FROM public.comp_mst c
  WHERE c.vers = 0
    AND c.del_yn = false
    AND lower(btrim(c.comp_nm)) = lower(btrim(rr.race_name::text))
    AND rr.race_date BETWEEN c.stt_dt AND coalesce(c.end_dt, c.stt_dt)
  ORDER BY c.crt_at
  LIMIT 1
) cm ON true
LEFT JOIN public.comp_evt_cfg e
  ON e.comp_id = cm.comp_id
 AND e.comp_evt_cd = public.migration_v2_map_evt_cd(rr.event_type::text)
 AND e.vers = 0
 AND e.del_yn = false
WHERE NOT EXISTS (
  SELECT 1 FROM public.rec_race_hist h WHERE h.race_result_id = rr.id
)
ON CONFLICT (mem_id, comp_evt_id, race_dt, race_nm, vers) DO NOTHING;

INSERT INTO public.fee_policy_cfg (
  team_id,
  aply_stt_dt,
  aply_end_dt,
  monthly_fee_amt,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  date '2020-01-01',
  date '2099-12-31',
  1,
  0,
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.fee_policy_cfg f
  WHERE f.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND f.vers = 0
    AND f.del_yn = false
);

DROP FUNCTION IF EXISTS public.migration_v2_map_mem_st_cd(public.member_status);
DROP FUNCTION IF EXISTS public.migration_v2_map_evt_cd(text);
DROP FUNCTION IF EXISTS public.migration_v2_norm_email(text);
DROP FUNCTION IF EXISTS public.migration_v2_norm_phone(text);
