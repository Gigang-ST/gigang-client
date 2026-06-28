-- fee_due_exm_hist 에 rflt_yn(잔액 반영 여부) 컬럼 + 멱등/합산 인덱스 추가.
--
-- 배경(설계 §5·§6): 출석 감면 배치는 전월 면제를 rflt_yn=false 로 INSERT 하고,
--   잔액 재계산이 rflt_yn=false 면제를 전부 합산한 뒤 rflt_yn=true 로 마킹한다.
--   이렇게 하면 합산 기준이 aply_ym(귀속월)이 아니라 "아직 잔액에 안 들어간 것"이 되어,
--   배치를 늦게 돌려 과거 월 면제가 뒤늦게 꽂혀도 다음 재계산이 반드시 잡는다.
--
-- ⚠️ 백필 안전성(설계 §6.1.1): 기존 면제는 전부 ⓐ재계산이 INSERT한 규칙 면제(생성=즉시 반영)
--    또는 ⓑ관리자 수동(manual) 면제뿐이고, 한 번이라도 재계산이 돌았다면 이미 bal_amt 에 녹아 있다.
--    → del_yn=false 전부 true 백필이 맞다.
--    단, "생성됐지만 아직 재계산이 안 돈" 면제가 있으면 잘못 true 로 칠해져 영영 누락된다.
--    → 이 마이그레이션 적용 전 전체 재계산을 한 번 돌려 모든 면제를 반영시킬 것.
--      그리고 적용 후 첫 재계산 시 모든 멤버 잔액이 백필 이전과 동일한지 회귀 검증할 것.

ALTER TABLE public.fee_due_exm_hist
  ADD COLUMN IF NOT EXISTS rflt_yn boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fee_due_exm_hist.rflt_yn IS '잔액 반영 여부 (재계산이 합산하면 true)';

-- 기존 데이터(이미 잔액에 녹은 면제)는 true 백필. ⚠️ 위 주석대로 적용 전 전체 재계산 필수.
UPDATE public.fee_due_exm_hist SET rflt_yn = true WHERE del_yn = false;

-- 퀘스트 면제 멱등 보장: 월당 1건 (배치 재실행 안전)
CREATE UNIQUE INDEX IF NOT EXISTS uk_fee_exm_hist_quest
  ON public.fee_due_exm_hist (team_id, mem_id, aply_ym)
  WHERE grant_src_enm = 'rule_attd_quest' AND del_yn = false;

-- 미반영 면제 합산용 인덱스 (재계산이 rflt_yn=false 를 멤버별로 조회)
CREATE INDEX IF NOT EXISTS ix_fee_exm_hist_unrflt
  ON public.fee_due_exm_hist (team_id, mem_id)
  WHERE rflt_yn = false AND del_yn = false;
