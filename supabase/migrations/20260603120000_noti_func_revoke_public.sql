-- create_noti_for_team 함수 실행 권한을 service_role로만 제한
-- SECURITY DEFINER 함수가 PUBLIC에 열려있으면 임의 호출자가 팀 전체 알림 생성 가능
REVOKE EXECUTE ON FUNCTION create_noti_for_team(uuid, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_noti_for_team(uuid, text, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION create_noti_for_team(uuid, text, text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_noti_for_team(uuid, text, text, text, uuid, text) TO service_role;
