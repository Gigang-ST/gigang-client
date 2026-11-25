-- 회비 거래 분할 확정(#754): 은행 거래 한 건을 금액으로 나눠 줄마다 다른 분류·대상으로 확정한다.
--
-- 구조: 원거래(부모) 행은 그대로 두고 del_yn=true + split_yn=true 로 숨긴다(재업로드 중복방지 지문으로 남는다).
--       나눈 줄(자식)은 fee_txn_hist 에 확정된 행으로 따로 들어가며 split_parent_id 로 부모에 묶인다.
--       그래서 잔액 재계산·프로젝트 모금액·통장 현황 등 기존 집계는 코드 변경 없이 자식 행을 그대로 센다.
-- 취소: 자식을 전부 del_yn=true 로 내리고 부모를 미확정으로 되살린다(앱 cancel-core).
SET lock_timeout = '3s';

ALTER TABLE public.fee_txn_hist
  ADD COLUMN IF NOT EXISTS split_yn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_parent_id uuid REFERENCES public.fee_txn_hist (txn_id);

COMMENT ON COLUMN public.fee_txn_hist.split_yn IS '분할 확정된 원거래(부모) 표시 — del_yn=true 로 숨겨 두고 자식 행이 대신 센다';
COMMENT ON COLUMN public.fee_txn_hist.split_parent_id IS '분할 줄(자식)이 가리키는 원거래(부모) txn_id. 일반 거래는 null';
