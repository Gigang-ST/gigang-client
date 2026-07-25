-- get_team_overview: 주간 판정값(weeks)을 "같은 요일 경과 시점 누적"으로 자른다.
--
-- 왜: 전광판 오버뷰(Team Pulse)의 심박수는 이번 주를 직전 4주와 견준 비율로 판정한다.
-- 그런데 기존 함수는 이번 주만 now()까지 누적하고 과거 4주는 온전한 한 주라, 월요일엔
-- 분자(이번 주 누적)가 0에 가까워 심박이 무조건 죽고 주말로 갈수록 차오르는 톱니가 생겼다.
-- 심박수 은유("지금 살아있는 정도")와 안 맞아, 과거 4주도 이번 주와 **같은 요일 경과
-- 시점까지만** 세어 같은 잣대로 비교한다(월요일=지난 4주의 월요일까지, 화요일=화요일까지).
--
-- 범위: weeks(판정용)만 컷오프를 적용한다. months(화면 수치 격자)는 이번 달 온전한 누적이
-- 맞으므로 그대로 둔다. gthr_cnt도 함께 컷해 weeks의 의미를 "같은 시점 누적"으로 일관되게 한다.
--
-- 요일 단위(날짜): 이번 주 경과 일수 d = floor((now_kst - 이번주시작)/1일). 각 주 컷오프는
-- w_start + (d+1)일의 자정(KST)이다(그 요일 끝까지 포함). 이번 주는 그 값이 미래일 수 있어
-- LEAST(컷오프, now())로 막는다 — 과거 주도 같은 식이지만 이미 지난 주라 항상 컷오프가 이긴다.

CREATE OR REPLACE FUNCTION public.get_team_overview(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH elapsed AS (
  -- 이번 주 경과 일수(0=월요일 당일). 판정을 "같은 요일 시점"으로 맞추는 기준.
  SELECT floor(extract(epoch FROM (now() AT TIME ZONE 'Asia/Seoul')
                - date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')) / 86400)::int AS days
),
weeks AS (
  SELECT gs::date                                        AS w_start,
         (gs AT TIME ZONE 'Asia/Seoul')                  AS w_from,
         -- 컷오프: 그 주 시작 + (경과일+1)일 자정(KST)을 UTC로. 단 now()를 넘지 않게.
         -- 이번 주는 now()로 잘리고, 과거 주는 "그 주의 같은 요일 시점"으로 잘린다.
         LEAST(
           ((gs::date::timestamp + make_interval(days => (SELECT days FROM elapsed) + 1))
              AT TIME ZONE 'Asia/Seoul'),
           now()
         )                                               AS w_to
  FROM generate_series(
    date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') - interval '7 weeks',
    date_trunc('week', now() AT TIME ZONE 'Asia/Seoul'),
    interval '1 week'
  ) AS gs
),
months AS (
  SELECT gs::date                                         AS m_start,
         (gs AT TIME ZONE 'Asia/Seoul')                   AS m_from,
         LEAST((gs + interval '1 month') AT TIME ZONE 'Asia/Seoul', now()) AS m_to
  FROM generate_series(
    date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - interval '5 months',
    date_trunc('month', now() AT TIME ZONE 'Asia/Seoul'),
    interval '1 month'
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
    (
      (SELECT count(*) FROM public.rec_race_hist rr
        INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
         AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
        WHERE rr.vers = 0 AND rr.del_yn = false
          AND rr.crt_at >= w.w_from AND rr.crt_at < w.w_to)
      +
      (SELECT count(*) FROM public.post_mst pm
        WHERE pm.team_id = p_team_id AND pm.del_yn = false
          AND pm.post_type_enm = 'record_flex'
          AND pm.crt_at >= w.w_from AND pm.crt_at < w.w_to)
    )::integer AS rec_cnt
  FROM weeks w
),
mo AS (
  SELECT
    m.m_start,
    (SELECT count(*) FROM public.gthr_mst gm
      WHERE gm.team_id = p_team_id AND gm.del_yn = false
        AND gm.stt_at >= m.m_from AND gm.stt_at < m.m_to)::integer AS gthr_cnt,
    (SELECT count(*) FROM public.gthr_attd_rel ga
      INNER JOIN public.gthr_mst gm ON gm.gthr_id = ga.gthr_id
       AND gm.del_yn = false AND gm.team_id = p_team_id
      WHERE gm.stt_at >= m.m_from AND gm.stt_at < m.m_to)::integer AS attd_cnt,
    (
      (SELECT count(*) FROM public.rec_race_hist rr
        INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
         AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
        WHERE rr.vers = 0 AND rr.del_yn = false
          AND rr.crt_at >= m.m_from AND rr.crt_at < m.m_to)
      +
      (SELECT count(*) FROM public.post_mst pm
        WHERE pm.team_id = p_team_id AND pm.del_yn = false
          AND pm.post_type_enm = 'record_flex'
          AND pm.crt_at >= m.m_from AND pm.crt_at < m.m_to)
    )::integer AS rec_cnt
  FROM months m
)
SELECT jsonb_build_object(
  'mem_cnt', (SELECT c FROM mem_cnt),
  'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'w_start',  wk.w_start,
      'gthr_cnt', wk.gthr_cnt,
      'attd_cnt', wk.attd_cnt,
      'rec_cnt',  wk.rec_cnt
    ) ORDER BY wk.w_start) FROM wk), '[]'::jsonb),
  'months', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'm_start',  mo.m_start,
      'gthr_cnt', mo.gthr_cnt,
      'attd_cnt', mo.attd_cnt,
      'rec_cnt',  mo.rec_cnt
    ) ORDER BY mo.m_start) FROM mo), '[]'::jsonb)
);
$function$;
