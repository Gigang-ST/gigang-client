-- 마일리지런 정합성 강화: goal/activity를 participant(prt_id) 기준으로 관리
-- - evt_mlg_goal_cfg, evt_mlg_act_hist에 prt_id 추가
-- - 기존 evt_id+mem_id 기반 데이터 backfill
-- - prt_id FK + 인덱스 + 유니크 제약 추가

ALTER TABLE public.evt_mlg_goal_cfg
  ADD COLUMN IF NOT EXISTS prt_id uuid;

ALTER TABLE public.evt_mlg_act_hist
  ADD COLUMN IF NOT EXISTS prt_id uuid;

UPDATE public.evt_mlg_goal_cfg g
SET prt_id = p.prt_id
FROM public.evt_team_prt_rel p
WHERE g.evt_id = p.evt_id
  AND g.mem_id = p.mem_id
  AND g.prt_id IS NULL;

UPDATE public.evt_mlg_act_hist a
SET prt_id = p.prt_id
FROM public.evt_team_prt_rel p
WHERE a.evt_id = p.evt_id
  AND a.mem_id = p.mem_id
  AND a.prt_id IS NULL;

-- 기존 참여자 매핑이 불가능한 고아 데이터 정리 후 NOT NULL 적용
DELETE FROM public.evt_mlg_goal_cfg
WHERE prt_id IS NULL;

DELETE FROM public.evt_mlg_act_hist
WHERE prt_id IS NULL;

ALTER TABLE public.evt_mlg_goal_cfg
  ALTER COLUMN prt_id SET NOT NULL;

ALTER TABLE public.evt_mlg_act_hist
  ALTER COLUMN prt_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evt_mlg_goal_cfg_prt_id_fkey'
  ) THEN
    ALTER TABLE public.evt_mlg_goal_cfg
      ADD CONSTRAINT evt_mlg_goal_cfg_prt_id_fkey
      FOREIGN KEY (prt_id)
      REFERENCES public.evt_team_prt_rel(prt_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evt_mlg_act_hist_prt_id_fkey'
  ) THEN
    ALTER TABLE public.evt_mlg_act_hist
      ADD CONSTRAINT evt_mlg_act_hist_prt_id_fkey
      FOREIGN KEY (prt_id)
      REFERENCES public.evt_team_prt_rel(prt_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evt_mlg_goal_cfg_prt_id_goal_mth
  ON public.evt_mlg_goal_cfg (prt_id, goal_mth);

CREATE INDEX IF NOT EXISTS idx_evt_mlg_act_hist_prt_id_act_dt
  ON public.evt_mlg_act_hist (prt_id, act_dt);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_evt_mlg_goal_cfg_prt_mth'
  ) THEN
    ALTER TABLE public.evt_mlg_goal_cfg
      ADD CONSTRAINT uq_evt_mlg_goal_cfg_prt_mth UNIQUE (prt_id, goal_mth);
  END IF;
END $$;

COMMENT ON COLUMN public.evt_mlg_goal_cfg.prt_id IS '이벤트 참여자 PK (evt_team_prt_rel.prt_id)';
COMMENT ON COLUMN public.evt_mlg_act_hist.prt_id IS '이벤트 참여자 PK (evt_team_prt_rel.prt_id)';
