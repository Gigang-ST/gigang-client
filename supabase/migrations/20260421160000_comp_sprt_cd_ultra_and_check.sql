-- dev 등: COMP_SPRT_CD에 ultra 추가 + comp_mst.comp_sprt_cd CHECK 반영 (prd와 동일 스포츠 목록)

DO $$
DECLARE
  v_gid uuid;
BEGIN
  SELECT cd_grp_id INTO v_gid
  FROM public.cmm_cd_grp_mst
  WHERE cd_grp_cd = 'COMP_SPRT_CD' AND vers = 0 AND del_yn = false
  LIMIT 1;

  IF v_gid IS NULL THEN
    RAISE NOTICE 'COMP_SPRT_CD 그룹 없음 — 스킵';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cmm_cd_mst m
    WHERE m.cd_grp_id = v_gid AND m.cd = 'ultra' AND m.vers = 0 AND m.del_yn = false
  ) THEN
    RAISE NOTICE 'ultra 이미 존재 — 스킵';
    RETURN;
  END IF;

  UPDATE public.cmm_cd_mst m
  SET sort_ord = m.sort_ord + 1
  WHERE m.cd_grp_id = v_gid
    AND m.vers = 0
    AND m.del_yn = false
    AND m.sort_ord >= 3;

  INSERT INTO public.cmm_cd_mst (
    cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn
  )
  VALUES (v_gid, 'ultra', '울트라마라톤', NULL, 3, false, 0, false);
END;
$$;

ALTER TABLE public.comp_mst DROP CONSTRAINT IF EXISTS ck_comp_mst_comp_sprt_cd;

ALTER TABLE public.comp_mst
  ADD CONSTRAINT ck_comp_mst_comp_sprt_cd CHECK (
    comp_sprt_cd IS NULL
    OR comp_sprt_cd IN (
      'road_run',
      'ultra',
      'trail_run',
      'triathlon',
      'cycling'
    )
  );
