-- 월 스냅샷/활동이력 네이밍 및 정규화 2차 정리
-- 1) evt_mlg_mth_snap
--    - std_mth -> base_dt
--    - evt_id, mem_id 제거 (prt_id로만 연결)
-- 2) evt_mlg_act_hist
--    - distance_km -> dst_km
--    - elevation_m -> elv_m
--    - applied_mults -> aply_mults

ALTER TABLE public.evt_mlg_mth_snap
  RENAME COLUMN std_mth TO base_dt;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_evt_mlg_mth_snap_prt_std_mth'
  ) THEN
    ALTER TABLE public.evt_mlg_mth_snap
      RENAME CONSTRAINT uq_evt_mlg_mth_snap_prt_std_mth TO uq_evt_mlg_mth_snap_prt_base_dt;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_evt_mlg_mth_snap_prt_id_std_mth
  RENAME TO idx_evt_mlg_mth_snap_prt_id_base_dt;

ALTER TABLE public.evt_mlg_mth_snap
  DROP CONSTRAINT IF EXISTS evt_mlg_mth_snap_evt_id_fkey;

ALTER TABLE public.evt_mlg_mth_snap
  DROP CONSTRAINT IF EXISTS evt_mlg_mth_snap_mem_id_fkey;

ALTER TABLE public.evt_mlg_mth_snap
  DROP COLUMN IF EXISTS evt_id;

ALTER TABLE public.evt_mlg_mth_snap
  DROP COLUMN IF EXISTS mem_id;

COMMENT ON COLUMN public.evt_mlg_mth_snap.base_dt IS '기준월 (ex: 2026-05-01)';

ALTER TABLE public.evt_mlg_act_hist
  RENAME COLUMN distance_km TO dst_km;

ALTER TABLE public.evt_mlg_act_hist
  RENAME COLUMN elevation_m TO elv_m;

ALTER TABLE public.evt_mlg_act_hist
  RENAME COLUMN applied_mults TO aply_mults;

COMMENT ON COLUMN public.evt_mlg_act_hist.dst_km IS '거리 (km)';
COMMENT ON COLUMN public.evt_mlg_act_hist.elv_m IS '상승고도 (m), 수영은 null';
COMMENT ON COLUMN public.evt_mlg_act_hist.aply_mults IS '적용 배율 스냅샷 [{"mult_id","mult_nm","mult_val"}]';
