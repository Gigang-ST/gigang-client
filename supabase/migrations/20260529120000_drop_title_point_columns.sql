-- ttl_mst: base_pt 제거
ALTER TABLE public.ttl_mst DROP COLUMN IF EXISTS base_pt;

-- mem_ttl_rel: 포인트 관련 컬럼 전체 제거
ALTER TABLE public.mem_ttl_rel DROP COLUMN IF EXISTS grnt_pt;
ALTER TABLE public.mem_ttl_rel DROP COLUMN IF EXISTS aply_pt;
ALTER TABLE public.mem_ttl_rel DROP COLUMN IF EXISTS pt_calc_at;
ALTER TABLE public.mem_ttl_rel DROP COLUMN IF EXISTS pt_calc_bsis_json;
ALTER TABLE public.mem_ttl_rel DROP COLUMN IF EXISTS pt_chg_rsn_cd;

-- 포인트 계산 인덱스 제거
DROP INDEX IF EXISTS public.ix_mem_ttl_rel_pt_calc_at;

-- 공통코드: TTL_PT_CHG_RSN_CD 그룹 전체 제거
DELETE FROM public.cmm_cd_mst WHERE cd_grp_id = (
  SELECT cd_grp_id FROM public.cmm_cd_grp_mst WHERE cd_grp_cd = 'TTL_PT_CHG_RSN_CD'
);
DELETE FROM public.cmm_cd_grp_mst WHERE cd_grp_cd = 'TTL_PT_CHG_RSN_CD';
