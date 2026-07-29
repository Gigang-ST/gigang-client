-- 유령회원(현상수배) v3 — get_team_ghost_members
--   변경점(v2 → v3):
--     1) 활동 이력 없는 멤버를 가입일 폴백으로 포함하되 **30~100일 구간만**.
--        100일 초과는 서비스 오픈 전부터 있던 옛 회원이라 "이력 없음"이 잠수의 근거가 못 된다
--        (기록이 없는 게 아니라 기록할 페이지가 없던 시절 사람이다). 이 상한이 없으면
--        오픈 이전 가입자 전원이 영구 수배된다 — 운영계에서 18명이 그렇게 걸렸다.
--     2) 활동 이력 있는 멤버는 v2 그대로 100일 초과.
--     3) 정렬을 오래된 순 → **시드 고정 랜덤**으로. 오래된 순이면 최고참 실종자만 계속
--        박제되고 뒷사람은 영영 안 나온다. 시드는 호출자(서버 컴포넌트)가 진입마다 뽑아 넘긴다 —
--        DB에서 random()을 쓰면 이 조회는 캐시가 없어 리렌더마다 순서가 튄다(가로 스크롤 중
--        얼굴이 바뀐다). 시드가 고정이면 한 진입 안에서는 순서가 안 흔들린다.
--     4) LIMIT 8 → 30. 가로 스크롤이라 지면 부담이 없고, 실측상 전량 조회해도 2.5ms다.
--     5) never_actv 플래그 추가 — 한 번도 안 나온 사람에게 가입일을 "최종 목격"이라 적으면
--        거짓말이 되므로 카드 문구를 가르기 위해.
--
--   v2 시그니처(uuid 1인자)는 이 마이그레이션에서 지우지 않는다 — 코드 배포 전까지
--   구버전 호출이 살아 있어야 해서다. 코드 배포 후 별도 마이그레이션으로 DROP한다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_team_ghost_members(
  p_team_id uuid,
  p_seed text DEFAULT ''
)
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
         COALESCE(la.last_dt, (mm.crt_at AT TIME ZONE 'Asia/Seoul')::date) AS last_actv_dt,
         (today.d - COALESCE(la.last_dt, (mm.crt_at AT TIME ZONE 'Asia/Seoul')::date)) AS days_ago,
         (la.mem_id IS NULL) AS never_actv
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
  LEFT JOIN last_actv la ON la.mem_id = tm.mem_id
  CROSS JOIN today
  WHERE tm.team_id = p_team_id AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active'
    AND (
      -- 활동 이력 있음: 마지막 활동일이 100일 이전
      (la.mem_id IS NOT NULL AND la.last_dt < today.d - 100)
      -- 활동 이력 없음: 가입 30~100일. 100일 넘으면 서비스 오픈 이전 가입자라 제외.
      OR (la.mem_id IS NULL
          AND (mm.crt_at AT TIME ZONE 'Asia/Seoul')::date <  today.d - 30
          AND (mm.crt_at AT TIME ZONE 'Asia/Seoul')::date >= today.d - 100)
    )
  -- 시드 고정 랜덤: 같은 시드면 같은 순서, 시드가 바뀌면 조합도 바뀐다.
  ORDER BY md5(mm.mem_id::text || p_seed)
  LIMIT 30
)
SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'mem_id', g.mem_id, 'mem_nm', g.mem_nm, 'avatar_url', g.avatar_url,
    'last_actv_dt', g.last_actv_dt, 'days_ago', g.days_ago,
    'never_actv', g.never_actv) ORDER BY md5(g.mem_id::text || p_seed))
  FROM ghosts g), '[]'::jsonb);
$function$;

COMMENT ON FUNCTION public.get_team_ghost_members(uuid, text) IS
  '유령회원(현상수배) v3 — 활동 이력 있으면 마지막 활동일(모임 stt_at + 대회 race_dt의 max, 프로필 카드 last_actv와 동일 소스) 100일 초과, 이력 없으면 가입 30~100일(100일 초과는 서비스 오픈 이전 가입자라 제외). p_seed로 고정 랜덤 정렬 후 최대 30명. never_actv로 카드 문구를 가른다. 전광판 현상수배존 전용. KST 기준.';

REVOKE ALL ON FUNCTION public.get_team_ghost_members(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_ghost_members(uuid, text) TO anon, authenticated, service_role;
