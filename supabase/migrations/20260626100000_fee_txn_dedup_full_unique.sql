-- 회비 거래 중복방지 인덱스를 전체-컬럼 유니크로 교체.
--
-- 배경: 기존 인덱스는 `WHERE del_yn = false` 조건이 있어 살아있는 거래끼리만
-- 중복을 검사했다. 이는 롤백된 거래를 재업로드할 수 있게 하려는 의도였으나,
-- "한 번 삭제한 거래는 재업로드 시 다시 들어오지 않게" 하려는 요구와 충돌했다.
--
-- 정책 정리:
--   - 롤백(rollback-xlsx)  = 하드 딜리트 → 행이 사라지므로 정상 재유입
--   - 차단 삭제(delete-transaction) = 소프트 삭제(del_yn=true) → 지문으로 남아 재유입 차단
--
-- 따라서 WHERE 조건을 제거해 del_yn=true 거래도 중복 검사에 포함시킨다.
-- (적용 전 동일 (team_id, txn_dt, txn_tm, txn_amt, raw_name) 묶음이 2건 이상인
--  케이스가 없음을 prd/dev 양쪽에서 확인함)

DROP INDEX IF EXISTS public.uk_fee_txn_hist_dedup;

CREATE UNIQUE INDEX uk_fee_txn_hist_dedup
  ON public.fee_txn_hist (team_id, txn_dt, txn_tm, txn_amt, raw_name);
