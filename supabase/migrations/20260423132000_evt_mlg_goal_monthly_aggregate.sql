-- evt_mlg_goal_cfg를 월 스냅샷 테이블로 확장
-- - achieved_yn -> achv_yn 컬럼명 정리
-- - 월 집계 컬럼 추가: act_cnt, achv_mlg, lst_act_dt
-- - 기존 활동 로그 기준으로 백필

ALTER TABLE public.evt_mlg_goal_cfg
  RENAME COLUMN achieved_yn TO achv_yn;

ALTER TABLE public.evt_mlg_goal_cfg
  ADD COLUMN IF NOT EXISTS act_cnt integer NOT NULL DEFAULT 0;

ALTER TABLE public.evt_mlg_goal_cfg
  ADD COLUMN IF NOT EXISTS achv_mlg numeric(8,2) NOT NULL DEFAULT 0;

ALTER TABLE public.evt_mlg_goal_cfg
  ADD COLUMN IF NOT EXISTS lst_act_dt date;

UPDATE public.evt_mlg_goal_cfg g
SET
  act_cnt = COALESCE(s.act_cnt, 0),
  achv_mlg = COALESCE(s.achv_mlg, 0),
  lst_act_dt = s.lst_act_dt,
  achv_yn = COALESCE(s.achv_mlg, 0) >= g.goal_val,
  updated_at = now()
FROM (
  SELECT
    prt_id,
    date_trunc('month', act_dt)::date AS goal_mth,
    COUNT(*)::integer AS act_cnt,
    COALESCE(SUM(final_mlg), 0)::numeric(8,2) AS achv_mlg,
    MAX(act_dt)::date AS lst_act_dt
  FROM public.evt_mlg_act_hist
  GROUP BY prt_id, date_trunc('month', act_dt)::date
) s
WHERE g.prt_id = s.prt_id
  AND g.goal_mth = s.goal_mth;

UPDATE public.evt_mlg_goal_cfg
SET
  act_cnt = COALESCE(act_cnt, 0),
  achv_mlg = COALESCE(achv_mlg, 0),
  achv_yn = COALESCE(achv_mlg, 0) >= goal_val,
  updated_at = now();

COMMENT ON COLUMN public.evt_mlg_goal_cfg.achv_yn IS '월 목표 달성 여부';
COMMENT ON COLUMN public.evt_mlg_goal_cfg.act_cnt IS '해당 월 활동 기록 건수';
COMMENT ON COLUMN public.evt_mlg_goal_cfg.achv_mlg IS '해당 월 누적 마일리지';
COMMENT ON COLUMN public.evt_mlg_goal_cfg.lst_act_dt IS '해당 월 마지막 활동일';
