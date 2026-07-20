-- ============================================================
-- gthr_cncl_noti_type — 모임 참석 취소 알림 타입 추가
-- 참가자가 모임 참석을 취소하면 벙주(개설자)에게 알림이 발송된다.
-- 기준: gigang-gathering-cancel-accountability-v1 SG-05
--
-- 추가 타입: gthr_cncl — 참가자 참석 취소(벙주 알림)
-- ============================================================

ALTER TABLE public.noti_mst
  DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

-- NOT VALID로 추가 — 기존 행 전체 스캔(쓰기 블록)을 피한다.
ALTER TABLE public.noti_mst
  ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm IN (
    'ttl_grnt', 'adm_cust', 'dues_check_req', 'dues_notice',
    'cmnt_reply', 'cmnt_mention', 'sch_post_cmnt', 'sch_post_new',
    'gthr_new', 'gthr_upd', 'gthr_del',
    'gthr_cmnt', 'gthr_reply', 'gthr_mention', 'gthr_cncl',
    'fdbk_new', 'fdbk_rspd',
    'newbie_nudge_14', 'newbie_nudge_28',
    'reactivate_req'
  )) NOT VALID;

-- 기존 행 검증(공유 락만 잡아 쓰기를 막지 않는다).
ALTER TABLE public.noti_mst
  VALIDATE CONSTRAINT noti_mst_noti_type_enm_check;
