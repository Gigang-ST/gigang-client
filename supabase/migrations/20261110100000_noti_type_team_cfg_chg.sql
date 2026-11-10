-- 알림 유형 추가: team_cfg_chg — owner 만 바꾸는 팀 설정(모임 계좌·카톡 공지방)이 바뀌면 그 팀 owner·관리자에게 알린다.
-- (예전엔 관리자 누구나 바꿀 수 있었고 바뀌어도 아무도 몰랐다 — 2026-11-10 2차 리뷰 5번, 유저 결정)
-- 옛 코드는 이 유형을 안 쓰므로 배포 전후 언제 적용해도 안전하다. 목록은 20261015120000 + team_cfg_chg.
SET lock_timeout = '3s';

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
    'gthr_aply'::text, 'gthr_aprv'::text, 'gthr_rjct'::text,
    'gthr_promo'::text,
    'gthr_seat'::text,
    'batch_failed'::text,
    'reactivated'::text,
    -- owner 전용 팀 설정 변경(운영진)
    'team_cfg_chg'::text
  ])) NOT VALID;

ALTER TABLE public.noti_mst VALIDATE CONSTRAINT noti_mst_noti_type_enm_check;
