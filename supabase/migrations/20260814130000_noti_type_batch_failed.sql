-- noti_mst.noti_type_enm 에 'batch_failed' 추가 — 자동 배치 실패를 운영진에게 알린다.
--
-- 배경(설계 docs/design/2026-08-14-배치-자동화.md §3.4):
--   지금까지 배치는 수동이라 **화면에서 결과를 바로 봤다.** 크론으로 돌기 시작하면
--   조용히 실패하고, 다음 달에 "감면이 왜 안 됐지"로 발견된다. 배치는 자주 실패하지 않으므로
--   시끄러워질 걱정은 없고, 실패를 못 보는 쪽이 훨씬 비싸다.
--
--   딥링크는 관리자 배치 화면(`/admin/system/batch`)으로 — `lib/notifications/deep-link.ts`.

ALTER TABLE public.noti_mst
  DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

ALTER TABLE public.noti_mst
  ADD CONSTRAINT noti_mst_noti_type_enm_check CHECK (
    noti_type_enm = ANY (ARRAY[
      'ttl_grnt', 'adm_cust', 'dues_check_req', 'dues_notice',
      'cmnt_reply', 'cmnt_mention', 'sch_post_cmnt', 'sch_post_new',
      'gthr_new', 'gthr_upd', 'gthr_del', 'gthr_cmnt', 'gthr_reply',
      'gthr_mention', 'gthr_cncl', 'fdbk_new', 'fdbk_rspd',
      'newbie_nudge_14', 'newbie_nudge_28', 'reactivate_req',
      'post_cmnt', 'post_reply', 'brd_notice', 'brd_update',
      'batch_failed'
    ])
  );
