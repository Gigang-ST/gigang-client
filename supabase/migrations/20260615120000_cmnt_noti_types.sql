-- noti_mst.noti_type_enm 허용값에 cmnt_reply, cmnt_mention 추가
ALTER TABLE noti_mst
  DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

ALTER TABLE noti_mst
  ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm IN (
    'ttl_grnt', 'adm_cust', 'dues_check_req', 'dues_notice',
    'cmnt_reply', 'cmnt_mention'
  ));
