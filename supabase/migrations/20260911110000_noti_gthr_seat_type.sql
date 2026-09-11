-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- 모임 대기열 — 알림 타입 gthr_seat (선착순 구간 빈 자리 발생)
--   설계: docs/superpowers/specs/2026-09-11-모임-대기열-임박구간-design.md §3
--
-- gthr_promo(자동 승급)와 **반드시 갈라 둔다.** 어휘가 다르기 때문이다 —
--   gthr_promo : "자리가 나서 참석이 확정됐어요" (자동. 할 일이 없다)
--   gthr_seat  : "빈 자리가 났어요"              (직접 눌러야 한다)
-- 같은 타입으로 묶으면 선착순 구간 알림을 받고 "확정됐구나" 하고 안 누르는 사람이 생긴다.
-- 수신거부도 각자 따로 끌 수 있어야 한다.
--
-- 딥링크 맵(lib/notifications/deep-link.ts)과 알림 라벨·아이콘도 함께 갱신해야 한다 —
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
    'gthr_aply'::text, 'gthr_aprv'::text, 'gthr_rjct'::text,
    -- 모임 대기열 승급
    'gthr_promo'::text,
    -- 모임 선착순 구간 빈 자리 발생
    'gthr_seat'::text
  ])) NOT VALID;

-- 기존 행 검증 — 행 락을 잡지 않는다(SHARE UPDATE EXCLUSIVE).
ALTER TABLE public.noti_mst VALIDATE CONSTRAINT noti_mst_noti_type_enm_check;

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- 20260910120000_noti_gthr_promo_type.sql 의 배열(gthr_seat 제외)로 되돌린다.
-- ============================================================
