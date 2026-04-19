-- v2 컷오버: public 스키마의 미사용 레거시 테이블 제거
-- 전제: 앱 런타임이 v2 테이블(mem_mst, comp_mst, comp_reg_rel, rec_race_hist, mem_utmb_prf)만 사용

DROP TABLE IF EXISTS public.competition_registration CASCADE;
DROP TABLE IF EXISTS public.personal_best CASCADE;
DROP TABLE IF EXISTS public.race_result CASCADE;
DROP TABLE IF EXISTS public.utmb_profile CASCADE;
DROP TABLE IF EXISTS public.competition CASCADE;
DROP TABLE IF EXISTS public.member CASCADE;
