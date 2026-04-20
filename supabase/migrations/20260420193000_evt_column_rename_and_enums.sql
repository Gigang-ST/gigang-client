-- 이벤트 도메인 네이밍 정합성 정리
-- - *_cd(공통코드) / *_enm(enum) 규칙 정렬
-- - evt_mlg_act_hist.sprt_enm enum 전환
-- - evt_team_mst.stts_enm enum 전환

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'evt_stts_enm'
  ) THEN
    CREATE TYPE public.evt_stts_enm AS ENUM ('READY', 'ACTIVE', 'CLOSED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'evt_mlg_sprt_enm'
  ) THEN
    CREATE TYPE public.evt_mlg_sprt_enm AS ENUM ('RUNNING', 'TRAIL', 'CYCLING', 'SWIMMING');
  END IF;
END $$;

-- evt_team_mst
ALTER TABLE public.evt_team_mst RENAME COLUMN "desc" TO desc_txt;
ALTER TABLE public.evt_team_mst RENAME COLUMN status_cd TO stts_enm;
ALTER TABLE public.evt_team_mst
  ALTER COLUMN stts_enm TYPE public.evt_stts_enm
  USING stts_enm::public.evt_stts_enm;
ALTER TABLE public.evt_team_mst
  ALTER COLUMN stts_enm SET DEFAULT 'READY'::public.evt_stts_enm;

-- evt_team_prt_rel
ALTER TABLE public.evt_team_prt_rel RENAME COLUMN stt_month TO stt_mth;
ALTER TABLE public.evt_team_prt_rel RENAME COLUMN approve_yn TO aprv_yn;
ALTER TABLE public.evt_team_prt_rel RENAME COLUMN approved_at TO aprv_at;

-- evt_mlg_goal_cfg
ALTER TABLE public.evt_mlg_goal_cfg RENAME COLUMN goal_month TO goal_mth;

-- evt_mlg_act_hist
ALTER TABLE public.evt_mlg_act_hist RENAME COLUMN sport_cd TO sprt_enm;
ALTER TABLE public.evt_mlg_act_hist
  ALTER COLUMN sprt_enm TYPE public.evt_mlg_sprt_enm
  USING sprt_enm::public.evt_mlg_sprt_enm;

-- comments
COMMENT ON COLUMN public.evt_team_mst.stts_enm IS '상태 enum (READY/ACTIVE/CLOSED)';
COMMENT ON COLUMN public.evt_team_mst.desc_txt IS '설명';
COMMENT ON COLUMN public.evt_team_prt_rel.stt_mth IS '참여 시작월 (ex: 2026-05-01)';
COMMENT ON COLUMN public.evt_team_prt_rel.aprv_yn IS '운영진 입금확인 승인 여부';
COMMENT ON COLUMN public.evt_team_prt_rel.aprv_at IS '승인 일시';
COMMENT ON COLUMN public.evt_mlg_goal_cfg.goal_mth IS '대상월 (ex: 2026-05-01)';
COMMENT ON COLUMN public.evt_mlg_act_hist.sprt_enm IS '종목 enum (RUNNING/TRAIL/CYCLING/SWIMMING)';
