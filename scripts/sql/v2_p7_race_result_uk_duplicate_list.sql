-- P7 백필 전·후 진단: race_result → rec_race_hist UK 충돌 후보 목록
--
-- 배경
--   레거시에서 동일 회원이 같은 대회일·대회명·종목(comp_evt_id 매핑 결과)으로
--   중복 등록된 race_result 가 있으면, v2 UK (mem_id, comp_evt_id, race_dt, race_nm, vers)
--   와 충돌한다. 백필은 ON CONFLICT DO NOTHING 이라 한 건만 들어가고 나머지는 B-2 누락이 된다.
--   운영계(prd)에서도 동일하게 발생할 수 있으므로, 백필 전에 이 결과를 보고
--   유지할 race_result_id 를 고른 뒤 중복 행을 정리(삭제 또는 race_nm/dt/종목 구분)하는 것을 권장한다.
--
-- 선행: P1 mem_mst, P3 comp_mst, P4+02205 comp_evt_cfg (백필 P7과 동일)
-- 주의: comp_evt_id 가 NULL 로 매핑되는 행은 PostgreSQL UNIQUE 가 NULL 을 서로 다르게 취급해
--   UK 충돌이 나지 않을 수 있다. 본 쿼리는 comp_evt_id IS NOT NULL 인 행만 대상으로 한다.
--
-- 실행: 읽기 전용. Supabase SQL Editor 또는 psql.

WITH rr_mapped AS (
  SELECT
    rr.id AS race_result_id,
    rr.member_id AS mem_id,
    e.comp_evt_id,
    rr.race_date AS race_dt,
    rr.race_name::text AS race_nm,
    rr.event_type::text AS event_type_raw,
    rr.record_time_sec,
    rr.swim_time_sec,
    rr.bike_time_sec,
    rr.run_time_sec,
    rr.created_at,
    cm.comp_id AS mapped_comp_id
  FROM public.race_result rr
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = rr.member_id
   AND mm.vers = 0
   AND mm.del_yn = false
  LEFT JOIN LATERAL (
    SELECT c.comp_id
    FROM public.comp_mst c
    WHERE c.vers = 0
      AND c.del_yn = false
      AND lower(btrim(c.comp_nm)) = lower(btrim(rr.race_name::text))
      AND rr.race_date BETWEEN c.stt_dt AND coalesce(c.end_dt, c.stt_dt)
    ORDER BY c.crt_at
    LIMIT 1
  ) cm ON true
  LEFT JOIN public.comp_evt_cfg e
    ON e.comp_id = cm.comp_id
   AND e.comp_evt_cd = (
      CASE upper(btrim(coalesce(rr.event_type::text, '')))
        WHEN '5K' THEN '5K'
        WHEN '10K' THEN '10K'
        WHEN 'HALF' THEN 'HALF'
        WHEN 'FULL' THEN 'FULL'
        WHEN '50K' THEN '50K'
        WHEN '100K' THEN '100K'
        WHEN '100M' THEN '100M'
        ELSE NULL
      END
    )
   AND e.vers = 0
   AND e.del_yn = false
),
with_grp AS (
  SELECT
    m.*,
    count(*) OVER (
      PARTITION BY m.mem_id, m.comp_evt_id, m.race_dt, m.race_nm
    ) AS uk_dup_grp_size
  FROM rr_mapped m
  WHERE m.comp_evt_id IS NOT NULL
)
SELECT
  uk_dup_grp_size,
  race_result_id,
  mem_id,
  mapped_comp_id,
  comp_evt_id,
  race_dt,
  race_nm,
  event_type_raw,
  record_time_sec,
  swim_time_sec,
  bike_time_sec,
  run_time_sec,
  created_at
FROM with_grp
WHERE uk_dup_grp_size > 1
ORDER BY
  mem_id,
  comp_evt_id,
  race_dt,
  race_nm,
  created_at,
  race_result_id;
