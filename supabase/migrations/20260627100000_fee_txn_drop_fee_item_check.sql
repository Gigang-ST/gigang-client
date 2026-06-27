-- fee_txn_hist.fee_item_cd 의 하드코딩 CHECK 제거.
--
-- 배경: fee_item_cd 는 분류관리 화면을 통해 공통코드(cmm_cd_mst, FEE_ITEM_CD 그룹)에서
-- 자유롭게 추가/수정된다. 그런데 거래 테이블에는 5개 값('due','expense','event_fee',
-- 'goods','other')을 하드코딩한 CHECK 가 있어, 공통코드에 새 분류(예: test_fee)를 추가하면
-- 그 분류로 거래를 저장할 때 CHECK 위반(SQLSTATE 23514)이 발생했다.
--
-- 해결: 공통코드를 분류 유효성의 단일 진실(source of truth)로 삼는다.
--   - cmm_cd_mst.cd 는 그룹 간 유니크하지 않아( UNIQUE(cd_grp_id, cd, vers) ) 단순 FK 불가
--   - 따라서 CHECK 를 제거하고, 거래를 적재하는 서버 액션
--     (upload-xlsx / add-manual-transaction / update-fee-item)에서
--     "FEE_ITEM_CD 그룹에 존재하는 cd 인지" 를 조회·검증한다.

ALTER TABLE public.fee_txn_hist
  DROP CONSTRAINT IF EXISTS ck_fee_txn_hist_fee_item_cd;
