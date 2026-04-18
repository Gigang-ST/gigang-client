-- rec_race_hist: 대회(comp_id)·종목(comp_evt_cfg) FK 필수화
-- 앱은 기록 등록 시 대회를 선택하고, 종목 행이 없으면 서버에서 comp_evt_cfg를 추가한다.
-- 선행: 운영계 null 정리 완료. 개발계 잔여 null 행은 본 스크립트에서 삭제한다.

DELETE FROM public.rec_race_hist
WHERE comp_id IS NULL OR comp_evt_id IS NULL;

ALTER TABLE public.rec_race_hist DROP CONSTRAINT IF EXISTS fk_rec_race_hist__comp_mst;

ALTER TABLE public.rec_race_hist
  ADD CONSTRAINT fk_rec_race_hist__comp_mst
  FOREIGN KEY (comp_id) REFERENCES public.comp_mst (comp_id) ON DELETE RESTRICT;

ALTER TABLE public.rec_race_hist DROP CONSTRAINT IF EXISTS fk_rec_race_hist__comp_evt_cfg;

ALTER TABLE public.rec_race_hist
  ADD CONSTRAINT fk_rec_race_hist__comp_evt_cfg
  FOREIGN KEY (comp_evt_id) REFERENCES public.comp_evt_cfg (comp_evt_id) ON DELETE RESTRICT;

ALTER TABLE public.rec_race_hist
  ALTER COLUMN comp_id SET NOT NULL,
  ALTER COLUMN comp_evt_id SET NOT NULL;

COMMENT ON COLUMN public.rec_race_hist.comp_id IS '대회 마스터 FK (필수)';
COMMENT ON COLUMN public.rec_race_hist.comp_evt_id IS '대회 종목(comp_evt_cfg) FK (필수)';
