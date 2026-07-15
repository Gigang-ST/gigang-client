-- ============================================================
-- reactivate_req_noti_type — 재활성 문의 알림 타입 추가
-- 비활성/탈퇴 회원이 크루 참여를 시도하다 "관리자에게 문의하기"를 누르면
-- 관리자(owner/admin)에게 재활성 요청 알림이 발송된다. 클릭 시 회원관리로 딥링크.
-- 기준: 설계 메모 "비활성·탈퇴 회원 참여 흐름 통일" Phase 3
--
-- 추가 타입: reactivate_req — 재활성(활동 재개) 요청
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
    'gthr_cmnt', 'gthr_reply', 'gthr_mention',
    'fdbk_new', 'fdbk_rspd',
    'newbie_nudge_14', 'newbie_nudge_28',
    'reactivate_req'
  )) NOT VALID;

-- 기존 행 검증(공유 락만 잡아 쓰기를 막지 않는다).
ALTER TABLE public.noti_mst
  VALIDATE CONSTRAINT noti_mst_noti_type_enm_check;
