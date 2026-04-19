-- v2: mem_utmb_prf에 최근 대회 컬럼 추가
-- 배경: 레거시 utmb_profile에 recent_race_name/recent_race_record가 추가된 상태를 기준으로
--       v2 mem_utmb_prf에도 동등 정보를 유지한다.

ALTER TABLE public.mem_utmb_prf
  ADD COLUMN IF NOT EXISTS rct_race_nm text,
  ADD COLUMN IF NOT EXISTS rct_race_rec text;

COMMENT ON COLUMN public.mem_utmb_prf.rct_race_nm IS '최근 대회명 (from utmb_profile.recent_race_name)';
COMMENT ON COLUMN public.mem_utmb_prf.rct_race_rec IS '최근 대회 기록 (from utmb_profile.recent_race_record)';

-- 기존 백필 데이터 보정: utmb_profile.recent_race_name 컬럼이 존재할 때만 실행
-- (fresh reset 시 레거시 컬럼 없으므로 스킵)
DO $$
DECLARE
  n_fill bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'utmb_profile'
      AND column_name = 'recent_race_name'
  ) THEN
    EXECUTE '
      UPDATE public.mem_utmb_prf p
      SET
        rct_race_nm = u.recent_race_name,
        rct_race_rec = u.recent_race_record
      FROM public.utmb_profile u
      WHERE p.utmb_prf_id = u.id
        AND (
          p.rct_race_nm IS DISTINCT FROM u.recent_race_name
          OR p.rct_race_rec IS DISTINCT FROM u.recent_race_record
        )';
    RAISE NOTICE 'v2_mem_utmb_prf_recent_race_cols: backfill from utmb_profile executed';
  ELSE
    RAISE NOTICE 'v2_mem_utmb_prf_recent_race_cols: utmb_profile.recent_race_name not found, skipping backfill';
  END IF;

  SELECT count(*) INTO n_fill
  FROM public.mem_utmb_prf
  WHERE vers = 0
    AND del_yn = false
    AND (rct_race_nm IS NOT NULL OR rct_race_rec IS NOT NULL);

  RAISE NOTICE 'v2_mem_utmb_prf_recent_race_cols: canonical_with_recent=%', n_fill;
END;
$$;

