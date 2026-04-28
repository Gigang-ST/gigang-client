-- 칭호 도메인: 공통코드(TTL_CTGR_CD) + enum(ttl_kind_enm)
-- 근거: .claude/docs/database-schema-v2-title-domain.md §3, §10.3 enum vs 공통코드

-- 1) 생성

-- 1-1) ttl_kind_enm: 자동/수여 구분 (값셋 안정 → enum)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ttl_kind_enm') THEN
    CREATE TYPE public.ttl_kind_enm AS ENUM ('auto', 'awarded');
  END IF;
END;
$$;

COMMENT ON TYPE public.ttl_kind_enm IS '칭호 종류: auto(자동 계산) / awarded(수여)';

-- 1-2) TTL_CTGR_CD 코드그룹 추가
INSERT INTO public.cmm_cd_grp_mst (cd_grp_cd, cd_grp_nm, sort_ord, vers, del_yn)
VALUES
  ('TTL_CTGR_CD', '칭호 카테고리', 110, 0, false)
ON CONFLICT (cd_grp_cd, vers) DO NOTHING;

-- 1-3) TTL_CTGR_CD 코드값 시드
INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, v.is_default_yn, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    ('TTL_CTGR_CD', 'running',   '러닝',   '도로 러닝 PB 기반 자동 칭호',    1, true),
    ('TTL_CTGR_CD', 'triathlon', '철인',   '철인3종 완주 기반 자동 칭호',     2, false),
    ('TTL_CTGR_CD', 'trail',     '트레일', '트레일러닝 완주 기반 자동 칭호',  3, false),
    ('TTL_CTGR_CD', 'cycling',   '사이클', '자전거 완주 기반 자동 칭호',      4, false),
    ('TTL_CTGR_CD', 'awarded',   '수여',   '기강단장 수여 칭호',              5, false)
) AS v(grp_cd, cd, cd_nm, cd_desc, sort_ord, is_default_yn)
WHERE g.cd_grp_cd = v.grp_cd
  AND g.vers = 0
  AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;

-- 2) 백필: 해당 없음

-- 3) 인덱스/제약: 해당 없음 (cmm_cd_* 기존 유니크 사용)

-- 4) RLS: 해당 없음

-- 5) 롤백
-- DELETE FROM public.cmm_cd_mst c
-- USING public.cmm_cd_grp_mst g
-- WHERE c.cd_grp_id = g.cd_grp_id
--   AND g.cd_grp_cd = 'TTL_CTGR_CD' AND g.vers = 0 AND g.del_yn = false
--   AND c.vers = 0 AND c.del_yn = false;
-- DELETE FROM public.cmm_cd_grp_mst WHERE cd_grp_cd = 'TTL_CTGR_CD' AND vers = 0;
-- DROP TYPE IF EXISTS public.ttl_kind_enm;
