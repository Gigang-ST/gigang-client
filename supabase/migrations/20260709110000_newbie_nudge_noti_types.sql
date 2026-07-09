-- ============================================================
-- newbie_nudge_noti_types — 뉴비 온보딩 미참석 넛지 알림 타입 추가
-- 기존 noti_mst.noti_type_enm CHECK 제약에 넛지 타입 2개 추가
-- 기준: docs/design/2026-07-08-뉴비온보딩-유령회원방지.md §7.1
--
-- 추가 타입:
--   newbie_nudge_14 — 가입 D+14 미참석 넛지
--   newbie_nudge_28 — 가입 D+28 미참석 넛지
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
    'fdbk_new', 'fdbk_rspd',
    'newbie_nudge_14', 'newbie_nudge_28'
  ));
