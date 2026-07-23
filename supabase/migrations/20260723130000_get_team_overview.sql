-- 기강 기상대 — 크루 전체 분위기를 한 상자에 담기 위한 오버뷰 RPC.
--
-- `get_team_story_feed`에 얹지 않고 함수를 나눈 이유: 관심사가 다르고(개별 소식 vs 크루 총량)
-- 캐시 수명도 다르다. 피드 함수는 이미 CTE가 열 개를 넘어 더 붙이면 읽기 어려워진다.
--
-- 반환:
--   mem_cnt — 활동 회원 수
--   weeks   — 최근 8주(월요일 시작, KST) 주간 합계. 마지막 원소가 이번 주(지금까지)다.
--             프론트가 마지막 값을 직전 4주 평균과 비교해 "기강 날씨"를 판정한다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_team_overview(p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH weeks AS (
  -- 서울 벽시계로 주 경계를 자른 뒤 timestamptz로 되돌려야 timestamptz 컬럼과 정확히 비교된다
  -- (세션 TimeZone이 UTC라 벽시계 값을 그대로 쓰면 9시간 밀린다).
  SELECT gs::date                                        AS w_start,
         (gs AT TIME ZONE 'Asia/Seoul')                  AS w_from,
         -- 이번 주는 아직 안 끝났다. 미래 일정이 이번 주 수치를 부풀리지 않게 now()로 자른다.
         LEAST((gs + interval '1 week') AT TIME ZONE 'Asia/Seoul', now()) AS w_to
  FROM generate_series(
    date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') - interval '7 weeks',
    date_trunc('week', now() AT TIME ZONE 'Asia/Seoul'),
    interval '1 week'
  ) AS gs
),
mem_cnt AS (
  SELECT count(*)::integer AS c
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
  WHERE tm.team_id = p_team_id AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active'
),
wk AS (
  SELECT
    w.w_start,
    (SELECT count(*) FROM public.gthr_mst gm
      WHERE gm.team_id = p_team_id AND gm.del_yn = false
        AND gm.stt_at >= w.w_from AND gm.stt_at < w.w_to)::integer AS gthr_cnt,
    (SELECT count(*) FROM public.gthr_attd_rel ga
      INNER JOIN public.gthr_mst gm ON gm.gthr_id = ga.gthr_id
       AND gm.del_yn = false AND gm.team_id = p_team_id
      WHERE gm.stt_at >= w.w_from AND gm.stt_at < w.w_to)::integer AS attd_cnt,
    (SELECT count(*) FROM public.rec_race_hist rr
      INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
       AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
      WHERE rr.vers = 0 AND rr.del_yn = false
        AND rr.crt_at >= w.w_from AND rr.crt_at < w.w_to)::integer AS rec_cnt
  FROM weeks w
)
SELECT jsonb_build_object(
  'mem_cnt', (SELECT c FROM mem_cnt),
  'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'w_start',  wk.w_start,
      'gthr_cnt', wk.gthr_cnt,
      'attd_cnt', wk.attd_cnt,
      'rec_cnt',  wk.rec_cnt
    ) ORDER BY wk.w_start) FROM wk), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.get_team_overview(uuid) IS
  '기강 기상대 — 활동 회원 수 + 최근 8주(월요일 시작, KST) 주간 합계(모임/참석 연인원/기록). 마지막 원소가 이번 주(now()까지). 전광판 상단 오버뷰 박스 전용.';

REVOKE ALL ON FUNCTION public.get_team_overview(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_overview(uuid) TO anon, authenticated, service_role;
