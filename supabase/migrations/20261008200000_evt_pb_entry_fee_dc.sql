-- 겨울 10K PB 클래스 — 마일리지런 참가자 할인을 보증금이 아니라 참가비에서 깎는다 (오너 지시 2026-10-08)
--
-- 1단계(Expand): 새 컬럼 entry_fee_dc_amt 를 만들고 이미 들어온 신청의 할인을 옮긴다.
--   옛 컬럼 deposit_dc_amt 는 **이 파일에선 지우지 않는다** — 운영에서 이 마이그레이션과 새 코드 배포 사이에
--   옛 코드가 그 컬럼을 읽고 쓴다. 지우는 건 배포 뒤 20261008200100_evt_pb_drop_deposit_dc.sql.
--
-- 옮기는 규칙: 보증금은 정가로 되돌리고(할인분을 더한다) 참가비에서 그만큼 깎는다 — **입금할 합계는 그대로**다.
--   참가비보다 큰 할인은 참가비까지만 옮긴다(관리자 설정 폼이 「할인 ≤ 참가비」로 막는다).
--   늦은 합류자는 옛 규칙에선 할인이 없었으므로(보증금 0) 옮길 것도 없다 — 새 규칙의 할인은 새 신청부터다.
SET lock_timeout = '3s';

ALTER TABLE public.evt_pb_prt_rel
  ADD COLUMN IF NOT EXISTS entry_fee_dc_amt integer NOT NULL DEFAULT 0
    CONSTRAINT ck_evt_pb_prt_rel_entry_fee_dc_amt CHECK (entry_fee_dc_amt >= 0);
COMMENT ON COLUMN public.evt_pb_prt_rel.entry_fee_dc_amt IS
  '신청 때 적용된 참가비 할인액(원, 마일리지런 참가자 할인). entry_fee_amt 는 할인 뒤 실제 참가비다 — 표시·감사용, 환급과 무관';

UPDATE public.evt_pb_prt_rel
SET deposit_amt      = deposit_amt + deposit_dc_amt,
    entry_fee_amt    = entry_fee_amt - LEAST(deposit_dc_amt, entry_fee_amt),
    entry_fee_dc_amt = LEAST(deposit_dc_amt, entry_fee_amt),
    deposit_dc_amt   = 0,
    updated_at       = now()
WHERE deposit_dc_amt > 0;

COMMENT ON COLUMN public.evt_pb_cfg.mlg_dc_amt IS
  '마일리지런 참가자 참가비 할인액(원) — 같은 팀 MILEAGE_RUN 에 승인 참가한 적 있는 멤버의 신청 참가비에서 깎는다(보증금은 그대로)';
