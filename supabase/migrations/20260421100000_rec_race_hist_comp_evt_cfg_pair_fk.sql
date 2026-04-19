-- rec_race_hist: comp_id와 comp_evt_id가 동일 종목 행(comp_evt_cfg)을 가리키도록 composite FK로 정합성 보장
-- 단일 FK(comp_evt_id만)는 다른 대회 comp_id와 조합되는 잘못된 삽입을 막지 못함

UPDATE public.rec_race_hist r
SET comp_id = e.comp_id
FROM public.comp_evt_cfg e
WHERE e.comp_evt_id = r.comp_evt_id
  AND r.comp_id IS DISTINCT FROM e.comp_id;

ALTER TABLE public.comp_evt_cfg
  ADD CONSTRAINT uk_comp_evt_cfg_comp_comp_evt_id UNIQUE (comp_id, comp_evt_id);

ALTER TABLE public.rec_race_hist DROP CONSTRAINT IF EXISTS fk_rec_race_hist__comp_evt_cfg;

ALTER TABLE public.rec_race_hist
  ADD CONSTRAINT fk_rec_race_hist__comp_evt_cfg_pair
  FOREIGN KEY (comp_id, comp_evt_id) REFERENCES public.comp_evt_cfg (comp_id, comp_evt_id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_rec_race_hist__comp_evt_cfg_pair ON public.rec_race_hist IS
  'comp_evt_id가 가리키는 종목 행의 comp_id와 rec_race_hist.comp_id 일치 강제';
