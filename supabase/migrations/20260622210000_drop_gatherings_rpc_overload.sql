-- get_public_team_gatherings 구버전(p_mem_id 없는 오버로드) 제거
-- PostgREST 오버로드 충돌로 캘린더에서 모임이 보였다 안 보였다 하던 문제 수정
DROP FUNCTION IF EXISTS public.get_public_team_gatherings(uuid, date, date);
