-- 회비 거래에 통장 거래 후 잔액을 담는다 (#706)
SET lock_timeout = '3s';

-- 카카오뱅크 엑셀의 「거래후잔액」열. 마지막 거래의 값이 곧 통장 잔액이다.
-- 과거 거래는 비어 있다(null) — 누적 엑셀을 다시 올리면 중복 건너뛰기 때 채워진다.
ALTER TABLE public.fee_txn_hist
  ADD COLUMN IF NOT EXISTS txn_bal_amt bigint;

COMMENT ON COLUMN public.fee_txn_hist.txn_bal_amt IS '거래 후 통장 잔액(엑셀 거래후잔액). 없으면 null';
