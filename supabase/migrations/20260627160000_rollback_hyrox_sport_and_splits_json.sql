-- 하이록스 기록등록 기능 dev 롤백 (20260627113314_add_hyrox_sport_and_splits_json 역적용)
--
-- 사유: 운영계(prd) 미반영 상태로 dev에만 떠 있어 dev/prd 정합성 관리가 어려움.
--       하이록스 랭킹/기록등록 코드는 feature/hyrox-ranking 브랜치에 보존되어 있으며,
--       추후 기능 재개 시 add_hyrox_sport_and_splits_json 마이그와 함께 재적용한다.
-- 안전성: 적용 시점 splits_json 데이터 0건, sort_ord 원복값(triathlon=3, cycling=4) 확인 완료.

-- ③ HYROX_EVT_CD 그룹 + 부문 제거
DELETE FROM public.cmm_cd_mst
WHERE cd_grp_id = (SELECT cd_grp_id FROM public.cmm_cd_grp_mst WHERE cd_grp_cd='HYROX_EVT_CD');
DELETE FROM public.cmm_cd_grp_mst WHERE cd_grp_cd='HYROX_EVT_CD';

-- ② hyrox 종목 제거 + sort_ord 원복 (triathlon 4→3, cycling 5→4)
DELETE FROM public.cmm_cd_mst
WHERE cd_grp_id='1bc8f102-0175-4dbf-90fe-89164fae6494' AND cd='hyrox';
UPDATE public.cmm_cd_mst SET sort_ord = 3
 WHERE cd_grp_id='1bc8f102-0175-4dbf-90fe-89164fae6494' AND cd='triathlon';
UPDATE public.cmm_cd_mst SET sort_ord = 4
 WHERE cd_grp_id='1bc8f102-0175-4dbf-90fe-89164fae6494' AND cd='cycling';

-- ① splits_json 컬럼 제거 (데이터 0건 확인)
ALTER TABLE public.rec_race_hist DROP COLUMN IF EXISTS splits_json;
