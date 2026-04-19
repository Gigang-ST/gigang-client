-- comp_mst.comp_sprt_cd: 하드코딩 CHECK 제거 → cmm_cd (그룹 COMP_SPRT_CD)와 일치할 때만 허용
-- 신규 종목은 cmm_cd_mst만 추가하면 되고, 앱의 lib/comp-sprt-to-evt-grp.ts 이벤트 그룹 매핑은 별도 반영 필요.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.comp_mst c
    WHERE c.comp_sprt_cd IS NOT NULL
      AND c.vers = 0
      AND c.del_yn = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.cmm_cd_mst m
        INNER JOIN public.cmm_cd_grp_mst g ON g.cd_grp_id = m.cd_grp_id
        WHERE g.cd_grp_cd = 'COMP_SPRT_CD'
          AND g.vers = 0
          AND g.del_yn = false
          AND g.use_yn = true
          AND m.cd = c.comp_sprt_cd
          AND m.vers = 0
          AND m.del_yn = false
          AND m.use_yn = true
      )
  ) THEN
    RAISE EXCEPTION
      'comp_mst에 comp_sprt_cd가 있으나 COMP_SPRT_CD 공통코드에 없는 행이 있습니다. 먼저 cmm_cd_mst를 맞춘 뒤 재실행하세요.';
  END IF;
END;
$$;

ALTER TABLE public.comp_mst DROP CONSTRAINT IF EXISTS ck_comp_mst_comp_sprt_cd;

CREATE OR REPLACE FUNCTION public.comp_mst_validate_comp_sprt_cd()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.comp_sprt_cd IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cmm_cd_mst m
    INNER JOIN public.cmm_cd_grp_mst g ON g.cd_grp_id = m.cd_grp_id
    WHERE g.cd_grp_cd = 'COMP_SPRT_CD'
      AND g.vers = 0
      AND g.del_yn = false
      AND g.use_yn = true
      AND m.cd = NEW.comp_sprt_cd
      AND m.vers = 0
      AND m.del_yn = false
      AND m.use_yn = true
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    USING
      ERRCODE = '23514',
      MESSAGE = format(
        'comp_mst.comp_sprt_cd %L 은(는) 사용 중인 COMP_SPRT_CD 공통코드에 없습니다.',
        NEW.comp_sprt_cd
      );
END;
$$;

COMMENT ON FUNCTION public.comp_mst_validate_comp_sprt_cd() IS
  'comp_sprt_cd가 NULL이거나 cmm_cd_mst(COMP_SPRT_CD, vers=0, use_yn, 미삭제)에 존재하는 cd일 때만 허용.';

DROP TRIGGER IF EXISTS trg_comp_mst_validate_comp_sprt_cd ON public.comp_mst;

CREATE TRIGGER trg_comp_mst_validate_comp_sprt_cd
  BEFORE INSERT OR UPDATE OF comp_sprt_cd ON public.comp_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.comp_mst_validate_comp_sprt_cd();
