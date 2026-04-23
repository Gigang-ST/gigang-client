-- 월별 목표/집계 스냅샷 테이블 네이밍 정리
-- evt_mlg_goal_cfg -> evt_mlg_mth_snap

ALTER TABLE public.evt_mlg_goal_cfg
  RENAME TO evt_mlg_mth_snap;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evt_mlg_goal_cfg_evt_id_fkey'
  ) THEN
    ALTER TABLE public.evt_mlg_mth_snap
      RENAME CONSTRAINT evt_mlg_goal_cfg_evt_id_fkey TO evt_mlg_mth_snap_evt_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evt_mlg_goal_cfg_mem_id_fkey'
  ) THEN
    ALTER TABLE public.evt_mlg_mth_snap
      RENAME CONSTRAINT evt_mlg_goal_cfg_mem_id_fkey TO evt_mlg_mth_snap_mem_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evt_mlg_goal_cfg_prt_id_fkey'
  ) THEN
    ALTER TABLE public.evt_mlg_mth_snap
      RENAME CONSTRAINT evt_mlg_goal_cfg_prt_id_fkey TO evt_mlg_mth_snap_prt_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_evt_mlg_goal_cfg_prt_mth'
  ) THEN
    ALTER TABLE public.evt_mlg_mth_snap
      RENAME CONSTRAINT uq_evt_mlg_goal_cfg_prt_mth TO uq_evt_mlg_mth_snap_prt_mth;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_evt_mlg_goal_cfg_prt_id_goal_mth
  RENAME TO idx_evt_mlg_mth_snap_prt_id_goal_mth;

ALTER POLICY IF EXISTS evt_mlg_goal_cfg_select ON public.evt_mlg_mth_snap
  RENAME TO evt_mlg_mth_snap_select;

COMMENT ON TABLE public.evt_mlg_mth_snap IS '마일리지 월별 목표/집계 스냅샷';
