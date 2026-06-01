-- TTL_CTGR_CD에 mileage 카테고리 추가
INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, false, 0, false
FROM public.cmm_cd_grp_mst g
JOIN (
  VALUES
    ('mileage', '마일리지런', '마일리지런 이벤트 관련 칭호', 8)
) AS v(cd, cd_nm, cd_desc, sort_ord) ON true
WHERE g.cd_grp_cd = 'TTL_CTGR_CD'
  AND g.vers = 0
  AND g.del_yn = false
  AND NOT EXISTS (
    SELECT 1 FROM public.cmm_cd_mst c
    WHERE c.cd_grp_id = g.cd_grp_id AND c.cd = v.cd AND c.vers = 0 AND c.del_yn = false
  );
