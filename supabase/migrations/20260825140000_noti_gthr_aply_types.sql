-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- 모임 참여조건 · 운영진 승인제 — ⑤ 알림 타입 3종
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §7
--
--   gthr_aply — 개설자 + 팀 운영진에게 "새 신청이 들어왔다"
--   gthr_aprv — 신청자에게 "참가 확정"
--   gthr_rjct — 신청자에게 "반려" (+ 사유)
--
-- 딥링크 맵(lib/notifications/deep-link.ts)과 수신거부 설정도 함께 갱신해야 한다 —
-- 여기만 열고 맵을 빼먹으면 알림을 눌러도 아무 데도 안 간다.
-- ============================================================

ALTER TABLE public.noti_mst DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

ALTER TABLE public.noti_mst ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm = ANY (ARRAY[
    'ttl_grnt'::text, 'adm_cust'::text, 'dues_check_req'::text, 'dues_notice'::text,
    'cmnt_reply'::text, 'cmnt_mention'::text, 'sch_post_cmnt'::text, 'sch_post_new'::text,
    'gthr_new'::text, 'gthr_upd'::text, 'gthr_del'::text, 'gthr_cmnt'::text,
    'gthr_reply'::text, 'gthr_mention'::text, 'gthr_cncl'::text, 'fdbk_new'::text,
    'fdbk_rspd'::text, 'newbie_nudge_14'::text, 'newbie_nudge_28'::text,
    'reactivate_req'::text,
    'post_cmnt'::text, 'post_reply'::text,
    'brd_notice'::text, 'brd_update'::text,
    -- 모임 참가 신청·승인·반려
    'gthr_aply'::text, 'gthr_aprv'::text, 'gthr_rjct'::text
  ])) NOT VALID;

-- 기존 행 검증 — 행 락을 잡지 않는다(SHARE UPDATE EXCLUSIVE).
ALTER TABLE public.noti_mst VALIDATE CONSTRAINT noti_mst_noti_type_enm_check;

-- ============================================================
-- REVERT — 20260730090000_noti_board_types.sql 의 배열(3종 제외)로 되돌린다.
-- ============================================================
