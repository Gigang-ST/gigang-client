-- 월별 목표/집계 스냅샷 테이블 네이밍 정리
-- evt_mlg_goal_cfg -> evt_mlg_mth_snap

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'evt_mlg_goal_cfg'
      AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.evt_mlg_goal_cfg
      RENAME TO evt_mlg_mth_snap;
  END IF;
END $$;

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polname = 'evt_mlg_goal_cfg_select'
      AND polrelid = 'public.evt_mlg_mth_snap'::regclass
  ) THEN
    ALTER POLICY evt_mlg_goal_cfg_select ON public.evt_mlg_mth_snap
      RENAME TO evt_mlg_mth_snap_select;
  END IF;
END $$;

COMMENT ON TABLE public.evt_mlg_mth_snap IS '마일리지 월별 목표/집계 스냅샷';
