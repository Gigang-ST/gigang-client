-- 유령회원(현상수배) — get_team_ghost_members
--   기강이야기 전광판 하단 "현상수배존"에 쓴다. 오래 안 나온 활동 멤버를 서부영화 수배 포스터로 세운다.
--
-- 규칙:
--   1) 마지막 활동일 = 모임 참석일(gthr_mst.stt_at) + 대회 기록일(rec_race_hist.race_dt)의 max.
--      get_public_member_card(프로필 카드)의 last_actv CTE와 **동일 소스**다 —
--      프로필 카드의 "N일째 실종"과 전광판 수배 날짜가 어긋나지 않게 하기 위해서.
--   2) 활동 이력이 아예 없으면 제외(가입일 폴백 없음). "실종"은 한 번이라도 나왔다가 사라진 사람만.
--   3) 마지막 활동일이 오늘 기준 100일 이전인 사람만, 오래된 순 8명.
--
-- 이 함수는 SELECT만 하는 순수 조회다(부작용 없음). 세션 중 v1(pt_txn_hist·가입일 폴백)을 거쳐
-- 이 v2로 확정했고, 이 파일이 정본이다. 함수 본문은 dev DB의 실제 정의를 그대로 옮겼다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_team_ghost_members(p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d),
last_actv AS (
  -- 프로필 카드(get_public_member_card)의 last_actv와 동일: 모임 참석일 + 대회 기록일의 max
  SELECT u.mem_id, max(u.d) AS last_dt
  FROM (
    SELECT ga.mem_id, (gm.stt_at AT TIME ZONE 'Asia/Seoul')::date AS d
    FROM public.gthr_attd_rel ga
    INNER JOIN public.gthr_mst gm
      ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
    WHERE gm.stt_at < now()
    UNION ALL
    SELECT rr.mem_id, rr.race_dt
    FROM public.rec_race_hist rr
    WHERE rr.vers = 0 AND rr.del_yn = false AND rr.race_dt IS NOT NULL
  ) u
  GROUP BY u.mem_id
),
ghosts AS (
  SELECT mm.mem_id, mm.mem_nm, mm.avatar_url,
         la.last_dt AS last_actv_dt,
         (today.d - la.last_dt) AS days_ago
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
  INNER JOIN last_actv la ON la.mem_id = tm.mem_id, today
  WHERE tm.team_id = p_team_id AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active'
    AND la.last_dt < today.d - 100
  ORDER BY la.last_dt ASC
  LIMIT 8
)
SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'mem_id', g.mem_id, 'mem_nm', g.mem_nm, 'avatar_url', g.avatar_url,
    'last_actv_dt', g.last_actv_dt, 'days_ago', g.days_ago) ORDER BY g.last_actv_dt ASC)
  FROM ghosts g), '[]'::jsonb);
$function$;

COMMENT ON FUNCTION public.get_team_ghost_members(uuid) IS
  '유령회원(현상수배) — 마지막 활동일(모임 stt_at + 대회 race_dt의 max, 프로필 카드 last_actv와 동일 소스)이 100일 이전인 활동 멤버 8명, 오래된 순. 활동 이력 없는 멤버는 제외(가입일 폴백 없음). 전광판 현상수배존 전용. KST 기준.';

REVOKE ALL ON FUNCTION public.get_team_ghost_members(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_ghost_members(uuid) TO anon, authenticated, service_role;
