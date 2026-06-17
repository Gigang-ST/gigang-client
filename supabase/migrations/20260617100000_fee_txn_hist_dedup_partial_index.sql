-- fee_txn_hist 중복 방지 제약을 partial index로 교체
-- del_yn=false 인 살아있는 거래 사이에서만 중복을 막고,
-- 롤백(del_yn=true)된 거래는 재업로드 시 재삽입 허용
ALTER TABLE public.fee_txn_hist
  DROP CONSTRAINT uk_fee_txn_hist_dedup;

CREATE UNIQUE INDEX uk_fee_txn_hist_dedup
  ON public.fee_txn_hist (team_id, txn_dt, txn_tm, txn_amt, raw_name)
  WHERE del_yn = false;

-- fee_xlsx_upd_hist 파일 중복 제약도 partial index로 교체
-- 롤백(del_yn=true)된 업로드 이력은 동일 파일 재업로드 허용
ALTER TABLE public.fee_xlsx_upd_hist
  DROP CONSTRAINT uk_fee_xlsx_upd_hist_team_hash_vers;

CREATE UNIQUE INDEX uk_fee_xlsx_upd_hist_team_hash_vers
  ON public.fee_xlsx_upd_hist (team_id, file_hash, vers)
  WHERE del_yn = false;
