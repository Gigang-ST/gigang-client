-- 유령회원·카드 「실종」을 팀 가입일 기준으로(2026-11-27 유저 결정).
--
-- 예전 판정은 팀을 반쯤만 봤다 — 모임 참석은 그 팀 것만 셌지만 대회 기록은 팀 구분 없이 그 사람 것 전부를 셌고,
-- 팀 가입일은 아예 보지 않았다. 그래서 내일(11/28) 울산에 들어오는 사람이 3월 대회 기록 때문에 울산에서
-- 「257일째 실종」으로 떴다. 바꾸는 규칙:
--
-- - **흔적 = 이 팀에 들어온 뒤의 이 팀 모임 참석 + 이 팀 대회 참가(이미 지난 대회)**. 대회 기록 등록은 세지 않는다 —
--   기록은 기록용이고 참석이 아니다(유저). 대회 참가는 `comp_reg_rel`(참가·응원·봉사 모두 — 그 자리에 나온 것).
-- - 출발점 = 팀 가입일(`team_mem_rel.join_dt`, 비면 계정 생성일). 가입일이 아직 안 온 사람은 판정하지 않는다.
-- - 가입 뒤 흔적이 있으면 마지막 흔적부터 100일 → 「N일째 실종」
-- - 흔적이 없으면 출발점부터 30일 → 「무소식」. 예전엔 가입 100일이 넘으면 「앱 이전 가입자」라 뺐는데, 그건 기록이
--   없던 시절 가입자라는 뜻이었다. 이제는 출발점을 **앱에 모임 참석 기록이 생긴 날(2026-06-30, prd 최초 참석일)** 과
--   팀 가입일 중 늦은 날로 잡아, 그 뒤로 한 번도 안 나온 사람을 센다. 이 날짜는 기강에만 걸린다(울산은 11/28 출범).
--   이때는 「가입 N일째」가 아니라 「N일째 무소식」이라 `since_join`(세는 날이 팀 가입일인가)을 같이 싣는다.
--
-- 카드(`get_public_member_card`)의 마지막 활동일·최근 90일 활동 건수도 같은 흔적으로 센다 — 그대로 두면 울산 카드에
-- 「257일째 실종… 수배 중」이 뜬다. 카드의 「최근활동」 목록(무엇을 했나)은 손대지 않는다.
--
-- 반환 모양은 그대로(유령회원에 `since_join` 칸만 더한다) — 옛 코드도 그대로 읽어 배포 전·후 무관. 여러 번 돌려도 같은 결과다.

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_team_ghost_members(p_team_id uuid, p_seed text DEFAULT ''::text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d),
members AS (
  SELECT tm.mem_id, mm.mem_nm, mm.avatar_url,
         COALESCE(tm.join_dt, (mm.crt_at AT TIME ZONE 'Asia/Seoul')::date) AS join_dt
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
  WHERE tm.team_id = p_team_id AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active'
),
-- 이 팀에서 남긴 흔적 — 모임 참석 + 대회 참가(지난 대회). 대회 기록 등록(rec_race_hist)은 세지 않는다.
traces AS (
  SELECT ga.mem_id, (gm.stt_at AT TIME ZONE 'Asia/Seoul')::date AS d
  FROM public.gthr_attd_rel ga
  INNER JOIN public.gthr_mst gm
    ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
  WHERE gm.stt_at < now()
  UNION ALL
  SELECT cr.mem_id, c.stt_dt
  FROM public.comp_reg_rel cr
  INNER JOIN public.team_comp_plan_rel tcp
    ON tcp.team_comp_id = cr.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
   AND tcp.team_id = p_team_id
  INNER JOIN public.comp_mst c
    ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  CROSS JOIN today
  WHERE cr.vers = 0 AND cr.del_yn = false AND c.stt_dt <= today.d
),
judged AS (
  SELECT m.mem_id, m.mem_nm, m.avatar_url, m.join_dt,
         -- 앱에 모임 참석 기록이 생긴 날(prd 최초 참석) — 그 전 가입자는 이 날부터 센다
         GREATEST(m.join_dt, DATE '2026-06-30') AS start_dt,
         (SELECT max(t.d) FROM traces t WHERE t.mem_id = m.mem_id AND t.d >= m.join_dt) AS last_dt
  FROM members m
),
ghosts AS (
  SELECT j.mem_id, j.mem_nm, j.avatar_url,
         COALESCE(j.last_dt, j.start_dt) AS last_actv_dt,
         (today.d - COALESCE(j.last_dt, j.start_dt)) AS days_ago,
         (j.last_dt IS NULL) AS never_actv,
         (j.last_dt IS NULL AND j.start_dt = j.join_dt) AS since_join
  FROM judged j
  CROSS JOIN today
  WHERE j.join_dt <= today.d
    AND (
      -- 가입 뒤 흔적 있음: 마지막 흔적이 100일 이전
      (j.last_dt IS NOT NULL AND j.last_dt < today.d - 100)
      -- 가입 뒤 흔적 없음: 출발점에서 30일이 지남
      OR (j.last_dt IS NULL AND j.start_dt < today.d - 30)
    )
  -- 정렬·상한 없음: 후보 전체를 돌려준다(캐시 대상이라 시드에 의존하면 안 된다).
)
SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'mem_id', g.mem_id, 'mem_nm', g.mem_nm, 'avatar_url', g.avatar_url,
    'last_actv_dt', g.last_actv_dt, 'days_ago', g.days_ago,
    'never_actv', g.never_actv, 'since_join', g.since_join)
    -- 캐시 payload가 매번 같은 순서로 나오게 mem_id로 안정 정렬한다(화면 순서는 앱이 정한다).
    ORDER BY g.mem_id)
  FROM ghosts g), '[]'::jsonb);
$function$;

-- 권한은 CREATE OR REPLACE 가 그대로 둔다(20260918170000 — service_role 전용).

-- 카드: 본문 전체를 다시 쓰지 않고 두 자리만 바꾼다(20261110110500 과 같은 방식) — 못 찾으면 멈춘다.
DO $$
DECLARE
  -- 줄바꿈 통일 — Windows 에서 체크아웃한(CRLF) 파일로 로컬 DB 를 만들면 함수 본문에 \r 이 섞여 아래 찾기가 어긋난다
  d text := replace(pg_get_functiondef('public.get_public_member_card(uuid, uuid)'::regprocedure), E'\r\n', E'\n');
  old_last text := 'last_actv AS (
  SELECT max(d) AS last_dt FROM (
    SELECT max(gm.stt_at AT TIME ZONE ''Asia/Seoul'')::date AS d
    FROM public.gthr_attd_rel ga
    INNER JOIN public.gthr_mst gm
      ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
    WHERE ga.mem_id = p_mem_id AND gm.stt_at < now()
    UNION ALL
    SELECT max(rr.race_dt) FROM public.rec_race_hist rr
    WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
  ) x
),';
  new_last text := 'last_actv AS (
  -- 이 팀에 들어온 뒤의 흔적만(유령회원과 같은 기준, 2026-11-27): 모임 참석 + 대회 참가(지난 대회). 기록 등록은 세지 않는다
  SELECT max(d) AS last_dt FROM (
    SELECT max(gm.stt_at AT TIME ZONE ''Asia/Seoul'')::date AS d
    FROM public.gthr_attd_rel ga
    INNER JOIN public.gthr_mst gm
      ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
    WHERE ga.mem_id = p_mem_id AND gm.stt_at < now()
      AND (gm.stt_at AT TIME ZONE ''Asia/Seoul'')::date >= COALESCE((SELECT join_dt FROM me), ''-infinity''::date)
    UNION ALL
    SELECT max(c.stt_dt) FROM public.comp_reg_rel cr
    INNER JOIN public.team_comp_plan_rel tcp
      ON tcp.team_comp_id = cr.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
     AND tcp.team_id = p_team_id
    INNER JOIN public.comp_mst c
      ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
    WHERE cr.mem_id = p_mem_id AND cr.vers = 0 AND cr.del_yn = false
      AND c.stt_dt <= (now() AT TIME ZONE ''Asia/Seoul'')::date
      AND c.stt_dt >= COALESCE((SELECT join_dt FROM me), ''-infinity''::date)
  ) x
),';
  old_recent text := '(SELECT count(*) FROM public.rec_race_hist rr
      WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
        AND rr.race_dt >= (now() AT TIME ZONE ''Asia/Seoul'')::date - 90) AS recent_race_cnt';
  new_recent text := '(SELECT count(*) FROM public.comp_reg_rel cr
       INNER JOIN public.team_comp_plan_rel tcp
         ON tcp.team_comp_id = cr.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
        AND tcp.team_id = p_team_id
       INNER JOIN public.comp_mst c
         ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
      WHERE cr.mem_id = p_mem_id AND cr.vers = 0 AND cr.del_yn = false
        AND c.stt_dt <= (now() AT TIME ZONE ''Asia/Seoul'')::date
        AND c.stt_dt >= (now() AT TIME ZONE ''Asia/Seoul'')::date - 90
        AND c.stt_dt >= COALESCE((SELECT join_dt FROM me), ''-infinity''::date)) AS recent_race_cnt';
BEGIN
  IF position('유령회원과 같은 기준' IN d) > 0 THEN
    RAISE NOTICE 'get_public_member_card: 이미 팀 가입일 기준이라 건너뜀';
    RETURN;
  END IF;
  IF (length(d) - length(replace(d, old_last, ''))) / length(old_last) <> 1 THEN
    RAISE EXCEPTION 'get_public_member_card: 바꿀 자리(last_actv)를 정확히 한 번 찾지 못함 — 정의가 예상과 다르다';
  END IF;
  IF (length(d) - length(replace(d, old_recent, ''))) / length(old_recent) <> 1 THEN
    RAISE EXCEPTION 'get_public_member_card: 바꿀 자리(recent_race_cnt)를 정확히 한 번 찾지 못함 — 정의가 예상과 다르다';
  END IF;
  EXECUTE replace(replace(d, old_last, new_last), old_recent, new_recent);
END $$;
