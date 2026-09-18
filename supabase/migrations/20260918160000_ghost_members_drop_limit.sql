-- 현상수배 RPC에서 정렬·상한을 걷어낸다 — 그 둘은 앱(`lib/ghost-members.ts`)이 맡는다.
--
-- 왜: 후보 목록을 24시간 캐시하면서 `p_seed`를 빈 문자열로 고정했는데, RPC 안에
-- `ORDER BY md5(mem_id || p_seed) LIMIT 30`이 남아 있으면 **캐시에 담기는 30명이
-- 고정된다.** 후보가 30명을 넘는 순간 시드가 *누가 뜨는지*를 못 바꾸고 *그 30명 안의
-- 순서*만 바꾸게 되어, 시드를 도입한 이유였던 "최고참만 영구 박제"가 그대로 되살아난다.
-- prd는 현재 후보 27명이라 가려져 있지만 **dev는 이미 30명을 넘었다.**
--
-- 그래서 RPC는 "누가 후보인가"만 돌려주고(시드 무관 = 캐시 가능), 셔플과 상한은
-- `arrangeGhosts`가 진입마다 시드로 정한다. 후보는 팀 인원 상한(수백)이라 전량을
-- 돌려줘도 payload가 작다.
--
-- `p_seed` 인자는 **남겨 둔다** — 지우면 시그니처가 바뀌어 배포 순서에 따라 함수를 못 찾는
-- 창이 생긴다. 이제 안 쓰는 값이고, 앱은 계속 ''를 넘긴다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_team_ghost_members(
  p_team_id uuid,
  p_seed text DEFAULT ''::text  -- deprecated: 정렬은 앱이 한다. 시그니처 유지용으로만 남김
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
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
  -- 정렬·상한 없음: 후보 전체를 돌려준다(캐시 대상이라 시드에 의존하면 안 된다).
)
SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'mem_id', g.mem_id, 'mem_nm', g.mem_nm, 'avatar_url', g.avatar_url,
    'last_actv_dt', g.last_actv_dt, 'days_ago', g.days_ago,
    -- 캐시 payload가 매번 같은 순서로 나오게 mem_id로 안정 정렬한다(화면 순서는 앱이 정한다).
    'never_actv', g.never_actv) ORDER BY g.mem_id)
  FROM ghosts g), '[]'::jsonb);
$function$;
