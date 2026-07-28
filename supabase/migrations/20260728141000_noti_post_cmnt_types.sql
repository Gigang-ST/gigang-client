-- 운동기록(기강이야기 릴스) 댓글 알림 2종.
-- post_cmnt  = 내 기록에 댓글이 달림 → 기록 작성자에게
-- post_reply = 내 댓글에 답글이 달림 → 원댓글 작성자에게
--
-- 멘션은 기존 `cmnt_mention`을 그대로 쓴다 — entity 무관 공용 타입이라 새로 만들 이유가 없다
-- (모임이 gthr_mention을 따로 둔 건 딥링크가 갈려서인데, 그건 refTypeEnm으로도 갈린다).
ALTER TABLE public.noti_mst DROP CONSTRAINT noti_mst_noti_type_enm_check;

ALTER TABLE public.noti_mst ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm = ANY (ARRAY[
    'ttl_grnt'::text, 'adm_cust'::text, 'dues_check_req'::text, 'dues_notice'::text,
    'cmnt_reply'::text, 'cmnt_mention'::text, 'sch_post_cmnt'::text, 'sch_post_new'::text,
    'gthr_new'::text, 'gthr_upd'::text, 'gthr_del'::text, 'gthr_cmnt'::text,
    'gthr_reply'::text, 'gthr_mention'::text, 'gthr_cncl'::text, 'fdbk_new'::text,
    'fdbk_rspd'::text, 'newbie_nudge_14'::text, 'newbie_nudge_28'::text,
    'reactivate_req'::text,
    'post_cmnt'::text, 'post_reply'::text
  ]));
