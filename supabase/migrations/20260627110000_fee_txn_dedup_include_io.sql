-- 회비 거래 중복방지 유니크 인덱스에 거래 방향(txn_io_enm)을 추가한다.
--
-- 배경: 직전 인덱스(20260626100000)는 (team_id, txn_dt, txn_tm, txn_amt, raw_name) 만으로
-- 중복을 판정했다. 그러나 같은 날짜·시각·금액·이름이라도 입금/출금은 별개의 거래다.
-- (예: 동일 적요로 이체 후 즉시 반환되는 케이스) 거래 방향이 지문에서 빠져 있으면
-- 입금/출금 한 쌍 중 하나가 23505(unique_violation)로 적재되지 못한다.
--
-- 해결: 유니크 키에 txn_io_enm 을 포함해 거래 방향을 지문의 일부로 삼는다.
-- (컬럼 추가는 유니크 제약을 더 엄격하게 만드는 방향이므로 기존 데이터와 충돌하지 않는다.)

DROP INDEX IF EXISTS public.uk_fee_txn_hist_dedup;

CREATE UNIQUE INDEX uk_fee_txn_hist_dedup
  ON public.fee_txn_hist (team_id, txn_dt, txn_tm, txn_amt, raw_name, txn_io_enm);
