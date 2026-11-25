-- 분할 줄(자식)은 부모와 날짜·시각·이름이 같아 중복방지 인덱스에 걸릴 수 있으므로, 자식(split_parent_id 있음)은 지문에서 뺀다.
-- 부모(원거래)는 그대로 지문에 남아 같은 은행 거래가 재업로드돼도 다시 들어오지 않는다.
-- 키는 현재 정본(20260627110000_fee_txn_dedup_include_io)과 같다 — txn_io_enm(입금/출금) 포함, WHERE 조건만 추가.
-- 인덱스 작업만 단독 파일(CONCURRENTLY — 트랜잭션 밖). 새 인덱스를 먼저 만든 뒤 옛 인덱스를 내린다.
-- CONCURRENTLY 생성이 중간에 실패하면 INVALID 인덱스가 남아 IF NOT EXISTS 재시도가 조용히 통과하므로,
-- 먼저 같은 이름의 잔재를 내리고(없으면 무시) 새로 만든다.
SET lock_timeout = '3s';

DROP INDEX CONCURRENTLY IF EXISTS public.uk_fee_txn_hist_dedup_root;

CREATE UNIQUE INDEX CONCURRENTLY uk_fee_txn_hist_dedup_root
  ON public.fee_txn_hist (team_id, txn_dt, txn_tm, txn_amt, raw_name, txn_io_enm)
  WHERE split_parent_id IS NULL;

DROP INDEX CONCURRENTLY IF EXISTS public.uk_fee_txn_hist_dedup;

DROP INDEX CONCURRENTLY IF EXISTS public.ix_fee_txn_hist_split_parent;

CREATE INDEX CONCURRENTLY ix_fee_txn_hist_split_parent
  ON public.fee_txn_hist (split_parent_id)
  WHERE split_parent_id IS NOT NULL;
