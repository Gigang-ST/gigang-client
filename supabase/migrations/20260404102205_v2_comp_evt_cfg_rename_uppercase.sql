-- comp_evt_cfg: evt_cd → comp_evt_cd, 코드값 COMP_EVT_CD(cmm_cd_mst.cd)와 동일한 대문자 규약으로 통일
-- 선행: 20260404102204 (또는 동일 데이터가 comp_evt_cfg 에 있음)
-- 기준: 공통코드 시드 20260404064718 COMP_EVT_CD 의 cd 를 본 마이그레이션에서 대문자 규약으로 갱신
-- 재실행: evt_cd 컬럼이 이미 없으면 테이블 변경은 건너뛰고, 함수·(필요 시) cmm 만 갱신

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comp_evt_cfg'
      AND column_name = 'evt_cd'
  ) THEN
    ALTER TABLE public.comp_evt_cfg
      DROP CONSTRAINT IF EXISTS ck_comp_evt_cfg_evt_cd;

    UPDATE public.comp_evt_cfg c
    SET evt_cd = CASE c.evt_cd
      WHEN '5k' THEN '5K'
      WHEN '10k' THEN '10K'
      WHEN 'half' THEN 'HALF'
      WHEN 'full' THEN 'FULL'
      WHEN '50k' THEN '50K'
      WHEN '100k' THEN '100K'
      WHEN '100m' THEN '100M'
      ELSE c.evt_cd
    END,
    upd_at = now()
    WHERE c.vers = 0
      AND c.del_yn = false;

    ALTER TABLE public.comp_evt_cfg
      RENAME COLUMN evt_cd TO comp_evt_cd;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_comp_evt_cfg_comp_evt_cd'
        AND conrelid = 'public.comp_evt_cfg'::regclass
    ) THEN
      ALTER TABLE public.comp_evt_cfg
        ADD CONSTRAINT ck_comp_evt_cfg_comp_evt_cd CHECK (
          comp_evt_cd IN ('5K', '10K', 'HALF', 'FULL', '50K', '100K', '100M')
        );
    END IF;
  END IF;
END;
$$;

COMMENT ON COLUMN public.comp_evt_cfg.comp_evt_cd IS 'COMP_EVT_CD 공통코드(cmm_cd_mst.cd)와 동일 문자열';

UPDATE public.cmm_cd_mst c
SET
  cd = v.new_cd,
  upd_at = now()
FROM public.cmm_cd_grp_mst g,
  (VALUES
    ('5k', '5K'),
    ('10k', '10K'),
    ('half', 'HALF'),
    ('full', 'FULL'),
    ('50k', '50K'),
    ('100k', '100K'),
    ('100m', '100M')
  ) AS v(old_cd, new_cd)
WHERE c.cd_grp_id = g.cd_grp_id
  AND g.cd_grp_cd = 'COMP_EVT_CD'
  AND g.vers = 0
  AND g.del_yn = false
  AND c.cd = v.old_cd
  AND c.vers = 0
  AND c.del_yn = false;

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
