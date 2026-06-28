-- ============================================================
-- fdbk_noti_types — 건의함(feedback) 관련 알림 타입 추가
-- 기존 noti_mst.noti_type_enm CHECK 제약에 feedback 타입 2개 추가
--
-- 추가 타입:
--   fdbk_new   — 신규 건의 등록 알림 (팀 관리자 전원)
--   fdbk_rspd  — 운영진 답변 등록 알림 (건의 작성자)
-- ============================================================

ALTER TABLE public.noti_mst
  DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

ALTER TABLE public.noti_mst
  ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm IN (
    'ttl_grnt', 'adm_cust', 'dues_check_req', 'dues_notice',
    'cmnt_reply', 'cmnt_mention', 'sch_post_cmnt', 'sch_post_new',
    'gthr_new', 'gthr_upd', 'gthr_del',
    'gthr_cmnt', 'gthr_reply', 'gthr_mention',
    'fdbk_new', 'fdbk_rspd'
  ));
