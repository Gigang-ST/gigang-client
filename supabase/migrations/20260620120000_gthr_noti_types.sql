-- ============================================================
-- gthr_noti_types — 모임(gathering) 관련 알림 타입 추가
-- 기존 noti_mst.noti_type_enm CHECK 제약에 gathering 타입 6개 추가
--
-- 추가 타입:
--   gthr_new     — 신규 모임 생성 알림 (팀 전체 멤버)
--   gthr_upd     — 모임 정보 수정 알림 (참석자)
--   gthr_del     — 모임 삭제 알림 (참석자)
--   gthr_cmnt    — 개설자 모임 댓글 알림 (참석자)
--   gthr_reply   — 내 댓글에 답글 알림 (원댓글 작성자)
--   gthr_mention — 댓글 멘션 알림 (멘션된 멤버)
-- ============================================================

ALTER TABLE public.noti_mst
  DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

ALTER TABLE public.noti_mst
  ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm IN (
    'ttl_grnt', 'adm_cust', 'dues_check_req', 'dues_notice',
    'cmnt_reply', 'cmnt_mention', 'sch_post_cmnt', 'sch_post_new',
    'gthr_new', 'gthr_upd', 'gthr_del',
    'gthr_cmnt', 'gthr_reply', 'gthr_mention'
  ));
