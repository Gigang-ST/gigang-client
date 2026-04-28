-- 칭호 도메인 선결 마이그레이션: CYC_EVT_CD에 MEDIOFONDO 추가
-- 근거: .claude/docs/database-schema-v2-title-domain.md §5.4 (자전거 1등급 평가)
-- 패턴: 20260421160000_comp_sprt_cd_ultra_and_check.sql (sort_ord 재배치 + 코드 추가)

-- 1) 생성 (코드 추가)
DO $$
DECLARE
  v_gid uuid;
BEGIN
  SELECT cd_grp_id INTO v_gid
  FROM public.cmm_cd_grp_mst
  WHERE cd_grp_cd = 'CYC_EVT_CD' AND vers = 0 AND del_yn = false
  LIMIT 1;

  IF v_gid IS NULL THEN
    RAISE EXCEPTION 'CYC_EVT_CD 그룹이 없습니다. 20260407013000 마이그레이션 선행 필요.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cmm_cd_mst m
    WHERE m.cd_grp_id = v_gid
      AND m.cd = 'MEDIOFONDO'
      AND m.vers = 0
      AND m.del_yn = false
  ) THEN
    RAISE NOTICE 'MEDIOFONDO 이미 존재 — 스킵';
    RETURN;
  END IF;

  -- sort_ord 재배치: GRANFONDO(1)는 그대로, MEDIOFONDO를 1로 두고 GRANFONDO를 2로 밀고 나머지는 +1
  -- 칭호 등급(메디오폰도 1단계 < 그란폰도 2단계)과 일치시키기 위해 MEDIOFONDO를 sort_ord=1로
  UPDATE public.cmm_cd_mst m
  SET sort_ord = m.sort_ord + 1,
      is_default_yn = false
  WHERE m.cd_grp_id = v_gid
    AND m.vers = 0
    AND m.del_yn = false;

  INSERT INTO public.cmm_cd_mst (
    cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn
  )
  VALUES (v_gid, 'MEDIOFONDO', 'MEDIOFONDO', '사이클 메디오폰도', 1, true, 0, false);
END;
$$;

-- 2) 백필: 해당 없음 (신규 코드)

-- 3) 인덱스/제약: 해당 없음 (cmm_cd_mst 기존 유니크 사용)

-- 4) RLS: 해당 없음 (cmm_cd_mst 기존 정책 사용)

-- 5) 롤백
-- DELETE FROM public.cmm_cd_mst c
-- USING public.cmm_cd_grp_mst g
-- WHERE c.cd_grp_id = g.cd_grp_id
--   AND g.cd_grp_cd = 'CYC_EVT_CD' AND g.vers = 0 AND g.del_yn = false
--   AND c.cd = 'MEDIOFONDO' AND c.vers = 0 AND c.del_yn = false;
-- UPDATE public.cmm_cd_mst m
-- SET sort_ord = m.sort_ord - 1
-- FROM public.cmm_cd_grp_mst g
-- WHERE m.cd_grp_id = g.cd_grp_id
--   AND g.cd_grp_cd = 'CYC_EVT_CD' AND g.vers = 0 AND g.del_yn = false
--   AND m.vers = 0 AND m.del_yn = false;
