-- 마일리지 월 스냅샷 컬럼 네이밍 정리 + 활동 이력 정규화
-- 1) evt_mlg_mth_snap
--    - goal_mth -> std_mth (기준월)
--    - goal_val -> goal_mlg (목표 마일리지)
-- 2) evt_mlg_act_hist
--    - prt_id 기준으로 정규화: evt_id, mem_id 제거

ALTER TABLE public.evt_mlg_mth_snap
  RENAME COLUMN goal_mth TO std_mth;

ALTER TABLE public.evt_mlg_mth_snap
  RENAME COLUMN goal_val TO goal_mlg;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_evt_mlg_mth_snap_prt_mth'
  ) THEN
    ALTER TABLE public.evt_mlg_mth_snap
      RENAME CONSTRAINT uq_evt_mlg_mth_snap_prt_mth TO uq_evt_mlg_mth_snap_prt_std_mth;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_evt_mlg_mth_snap_prt_id_goal_mth
  RENAME TO idx_evt_mlg_mth_snap_prt_id_std_mth;

COMMENT ON COLUMN public.evt_mlg_mth_snap.std_mth IS '기준월 (ex: 2026-05-01)';
COMMENT ON COLUMN public.evt_mlg_mth_snap.goal_mlg IS '목표 마일리지 (정수)';

-- evt_mlg_act_hist의 evt_id/mem_id FK 및 컬럼 제거
ALTER TABLE public.evt_mlg_act_hist
  DROP CONSTRAINT IF EXISTS evt_mlg_act_hist_evt_id_fkey;

ALTER TABLE public.evt_mlg_act_hist
  DROP CONSTRAINT IF EXISTS evt_mlg_act_hist_mem_id_fkey;

ALTER TABLE public.evt_mlg_act_hist
  DROP COLUMN IF EXISTS evt_id;

ALTER TABLE public.evt_mlg_act_hist
  DROP COLUMN IF EXISTS mem_id;
