-- 겨울 10K PB 클래스 — 마일리지런 할인 2단계(Contract): 옛 보증금 할인 컬럼을 지운다
--
-- ⚠️ 운영에선 **새 코드(entry_fee_dc_amt 를 읽고 쓰는 앱)가 배포된 뒤에** 적용한다. 먼저 지우면 옛 코드의
--    신청·조회가 없는 컬럼을 select 해서 PB 화면이 통째로 실패한다.
--
-- 지우기 전에 1단계(20261008200000)의 이관을 한 번 더 돌린다 — 1단계와 배포 사이에 옛 코드로 들어온 신청이
-- 보증금 할인으로 저장돼 있을 수 있다. 이미 옮긴 행은 deposit_dc_amt = 0 이라 건드리지 않는다.
SET lock_timeout = '3s';

UPDATE public.evt_pb_prt_rel
SET deposit_amt      = deposit_amt + deposit_dc_amt,
    entry_fee_amt    = entry_fee_amt - LEAST(deposit_dc_amt, entry_fee_amt),
    entry_fee_dc_amt = LEAST(deposit_dc_amt, entry_fee_amt),
    deposit_dc_amt   = 0,
    updated_at       = now()
WHERE deposit_dc_amt > 0;

ALTER TABLE public.evt_pb_prt_rel DROP COLUMN IF EXISTS deposit_dc_amt;
