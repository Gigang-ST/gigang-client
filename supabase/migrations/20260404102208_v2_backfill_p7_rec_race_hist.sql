-- v2 백필 P7 전용: public.race_result → public.rec_race_hist
-- 적용 순서: 20260404102207 직후, 20260404102309 직전
-- 기준: database-schema-v2-migration-map.md §3.4; B-3 null 허용 + 리포트(rollout §3.1)
-- 선행: P1(`mem_mst`), P3(`comp_mst`), P4+02205(`comp_evt_cfg`)
--
-- `comp_id` / `comp_evt_id` 는 대회명·날짜·종목 매칭 실패 시 null (dev 정책).
-- `uk_rec_race_hist_mem_evt_dt_nm_vers` 충돌 시 `ON CONFLICT DO NOTHING` — 동일 (mem_id, comp_evt_id, race_dt, race_nm) 에
-- 서로 다른 `race_result.id` 가 매핑되면 **1:1 보존 불가**이므로 PR/이슈에 샘플 id 를 남긴다.
-- 충돌 후보 전체 목록(백필과 동일 매핑): `scripts/sql/v2_p7_race_result_uk_duplicate_list.sql`

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

DO $$
DECLARE
  n_rr bigint;
  n_hist bigint;
  n_comp_null bigint;
  n_evt_null bigint;
BEGIN
  SELECT count(*) INTO n_rr FROM public.race_result;
  SELECT count(*) INTO n_hist FROM public.rec_race_hist WHERE vers = 0 AND del_yn = false;
  SELECT count(*) FILTER (WHERE comp_id IS NULL) INTO n_comp_null
  FROM public.rec_race_hist WHERE vers = 0 AND del_yn = false;
  SELECT count(*) FILTER (WHERE comp_evt_id IS NULL) INTO n_evt_null
  FROM public.rec_race_hist WHERE vers = 0 AND del_yn = false;

  RAISE NOTICE 'v2_backfill_p7: race_result_cnt=%, rec_race_hist_canonical=%, comp_id_null=%, comp_evt_id_null=%',
    n_rr, n_hist, n_comp_null, n_evt_null;
END;
$$;
