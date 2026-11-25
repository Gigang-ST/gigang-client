-- 분할 줄(자식)은 부모와 날짜·시각·이름이 같아 중복방지 인덱스에 걸릴 수 있으므로, 자식(split_parent_id 있음)은 지문에서 뺀다.
-- 부모(원거래)는 그대로 지문에 남아 같은 은행 거래가 재업로드돼도 다시 들어오지 않는다.
-- 인덱스 작업만 단독 파일(CONCURRENTLY — 트랜잭션 밖). 새 인덱스를 먼저 만든 뒤 옛 인덱스를 내린다.
SET lock_timeout = '3s';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uk_fee_txn_hist_dedup_root
  ON public.fee_txn_hist (team_id, txn_dt, txn_tm, txn_amt, raw_name)
  WHERE split_parent_id IS NULL;

DROP INDEX CONCURRENTLY IF EXISTS public.uk_fee_txn_hist_dedup;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_fee_txn_hist_split_parent
  ON public.fee_txn_hist (split_parent_id)
  WHERE split_parent_id IS NOT NULL;
