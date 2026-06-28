-- 비로그인(anon) 사용자도 모임 상세 + 참석자 이름/아바타를 볼 수 있도록
-- SECURITY DEFINER 함수 추가 (mem_mst 에 anon SELECT 정책 없어도 우회 가능)
-- p_team_id로 팀 스코프 검증 — 타 팀 gthr_id 입력 시 null 반환

CREATE OR REPLACE FUNCTION get_gathering_detail(p_gthr_id uuid, p_team_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'max_prt_cnt', g.max_prt_cnt,
    'sprt_cd',     g.sprt_cd,
    'attendees',   COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'mem_id',    ar.mem_id,
            'mem_nm',    m.mem_nm,
            'avatar_url', m.avatar_url
          )
          ORDER BY ar.crt_at ASC
        )
        FROM   gthr_attd_rel ar
        LEFT JOIN mem_mst m ON m.mem_id = ar.mem_id
        WHERE  ar.gthr_id = p_gthr_id
      ),
      '[]'::json
    )
  )
  FROM  gthr_mst g
  WHERE g.gthr_id  = p_gthr_id
    AND g.team_id  = p_team_id
    AND g.del_yn   = false;
$$;

GRANT EXECUTE ON FUNCTION get_gathering_detail(uuid, uuid) TO anon, authenticated;
