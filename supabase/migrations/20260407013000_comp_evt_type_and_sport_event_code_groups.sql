-- comp_evt_cfg 이벤트 컬럼 의미 전환: comp_evt_cd(공통코드 강제) -> comp_evt_type(대회 이벤트 타입 자유값)
-- + cmm_cd_mst: 기존 COMP_EVT_CD 그룹 제거, 스포츠별 이벤트 코드 그룹 신설

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comp_evt_cfg'
      AND column_name = 'comp_evt_cd'
  ) THEN
    ALTER TABLE public.comp_evt_cfg
      DROP CONSTRAINT IF EXISTS ck_comp_evt_cfg_comp_evt_cd;

    ALTER TABLE public.comp_evt_cfg
      RENAME COLUMN comp_evt_cd TO comp_evt_type;
  END IF;
END;
$$;

COMMENT ON COLUMN public.comp_evt_cfg.comp_evt_type IS '대회 이벤트 타입(자유 텍스트, 예: 12K/OLYMPIC/FULL)';

-- 기존 공통 코드 그룹 COMP_EVT_CD 제거 (더 이상 테이블 강제 참조하지 않음)
DELETE FROM public.cmm_cd_mst c
USING public.cmm_cd_grp_mst g
WHERE c.cd_grp_id = g.cd_grp_id
  AND g.cd_grp_cd = 'COMP_EVT_CD'
  AND g.vers = 0
  AND g.del_yn = false
  AND c.vers = 0
  AND c.del_yn = false;

DELETE FROM public.cmm_cd_grp_mst
WHERE cd_grp_cd = 'COMP_EVT_CD'
  AND vers = 0
  AND del_yn = false;

-- 스포츠별 이벤트 코드 그룹 추가
INSERT INTO public.cmm_cd_grp_mst (cd_grp_cd, cd_grp_nm, sort_ord, vers, del_yn)
VALUES
  ('ROAD_EVT_CD', '로드러닝 이벤트 코드', 41, 0, false),
  ('ULTRA_EVT_CD', '울트라마라톤 이벤트 코드', 42, 0, false),
  ('TRAIL_EVT_CD', '트레일러닝 이벤트 코드', 43, 0, false),
  ('TRI_EVT_CD', '철인3종 이벤트 코드', 44, 0, false),
  ('CYC_EVT_CD', '사이클링 이벤트 코드', 45, 0, false)
ON CONFLICT (cd_grp_cd, vers) DO NOTHING;

INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, v.is_default_yn, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    -- ROAD_EVT_CD (sport-config: 5K, 10K, HALF, FULL)
    ('ROAD_EVT_CD', '5K', '5K', '로드러닝 5km', 1, true),
    ('ROAD_EVT_CD', '10K', '10K', '로드러닝 10km', 2, false),
    ('ROAD_EVT_CD', 'HALF', 'HALF', '로드러닝 하프', 3, false),
    ('ROAD_EVT_CD', 'FULL', 'FULL', '로드러닝 풀', 4, false),
    -- ULTRA_EVT_CD (sport-config: 50K, 80K, 100K, 100M)
    ('ULTRA_EVT_CD', '50K', '50K', '울트라 50km', 1, true),
    ('ULTRA_EVT_CD', '80K', '80K', '울트라 80km', 2, false),
    ('ULTRA_EVT_CD', '100K', '100K', '울트라 100km', 3, false),
    ('ULTRA_EVT_CD', '100M', '100M', '울트라 100mile', 4, false),
    -- TRAIL_EVT_CD (sport-config: 20K, 50K, 100K, 100M)
    ('TRAIL_EVT_CD', '20K', '20K', '트레일 20km', 1, true),
    ('TRAIL_EVT_CD', '50K', '50K', '트레일 50km', 2, false),
    ('TRAIL_EVT_CD', '100K', '100K', '트레일 100km', 3, false),
    ('TRAIL_EVT_CD', '100M', '100M', '트레일 100mile', 4, false),
    -- TRI_EVT_CD (sport-config: SPRINT, OLYMPIC, HALF, FULL)
    ('TRI_EVT_CD', 'SPRINT', 'SPRINT', '철인 스프린트', 1, true),
    ('TRI_EVT_CD', 'OLYMPIC', 'OLYMPIC', '철인 올림픽', 2, false),
    ('TRI_EVT_CD', 'HALF', 'HALF', '철인 하프', 3, false),
    ('TRI_EVT_CD', 'FULL', 'FULL', '철인 풀', 4, false),
    -- CYC_EVT_CD (sport-config: GRANFONDO, ROAD RACE, TIME TRIAL, CRITERIUM)
    ('CYC_EVT_CD', 'GRANFONDO', 'GRANFONDO', '사이클 그란폰도', 1, true),
    ('CYC_EVT_CD', 'ROAD_RACE', 'ROAD RACE', '사이클 로드레이스', 2, false),
    ('CYC_EVT_CD', 'TIME_TRIAL', 'TIME TRIAL', '사이클 개인독주', 3, false),
    ('CYC_EVT_CD', 'CRITERIUM', 'CRITERIUM', '사이클 크리테리움', 4, false)
) AS v(grp_cd, cd, cd_nm, cd_desc, sort_ord, is_default_yn)
WHERE g.cd_grp_cd = v.grp_cd
  AND g.vers = 0
  AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;
