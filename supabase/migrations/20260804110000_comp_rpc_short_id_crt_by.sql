-- get_public_team_competitions에 short_id · crt_by 추가
--
-- 대회 공유 링크는 `/schedule?comp=<short_id ?? comp_id>` 형태다(딥링크는 `?comp=`를 읽는
-- MiniCalendar가 있는 `/schedule`에 붙는다 — `/races`엔 상세 페이지가 없다).
-- 그런데 이 RPC가 short_id를 안 돌려줘서, `/races`(설정 → 대회 목록)에서 연 상세는
-- 폴백인 uuid로 링크를 만들었다. 같은 대회인데 홈 미니캘린더로 열면 short_id,
-- 대회탭에서 열면 uuid가 붙어 갈렸다.
--
-- crt_by는 대회 상세에서 "이 대회 내가 만든 건가"(수정 버튼 노출)를 판정하는 데 쓴다.
-- 서버(`updateCompetition`)가 다시 판정하므로 이건 어포던스용이지만, 안 실으면 자기가 만든
-- 대회인데도 버튼이 안 보인다.
--
-- 반환 컬럼을 늘리는 것이라 CREATE OR REPLACE로는 안 되고 DROP이 선행돼야 한다.
-- 본문은 20260622220000_calendar_rpc_cmnt_cte.sql 정의 그대로이고 두 컬럼만 얹는다.

DROP FUNCTION IF EXISTS public.get_public_team_competitions(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_public_team_competitions(
  p_team_id uuid,
  p_start   date DEFAULT NULL,
  p_end     date DEFAULT NULL
)
RETURNS TABLE (
  comp_id        uuid,
  short_id       text,
  crt_by         uuid,
  ext_id         text,
  comp_sprt_cd   text,
  comp_nm        text,
  stt_dt         date,
  end_dt         date,
  loc_nm         text,
  src_url        text,
  comp_evt_types text[],
  reg_evt_types  text[],
  reg_count      bigint,
  cmnt_count     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH cmnt_agg AS (
  SELECT entity_id AS comp_id, COUNT(*) AS cmnt_count
  FROM public.cmnt_mst
  WHERE entity_type = 'comp'
    AND del_yn = false
  GROUP BY entity_id
)
SELECT
  c.comp_id,
  c.short_id,
  c.crt_by,
  c.ext_id,
  c.comp_sprt_cd,
  c.comp_nm,
  c.stt_dt,
  c.end_dt,
  c.loc_nm,
  c.src_url,
  COALESCE(array_agg(DISTINCT ce.comp_evt_type) FILTER (WHERE ce.comp_evt_type IS NOT NULL), '{}') AS comp_evt_types,
  COALESCE(array_agg(DISTINCT re.comp_evt_type) FILTER (WHERE re.comp_evt_type IS NOT NULL), '{}') AS reg_evt_types,
  count(DISTINCT cr.comp_reg_id)                                                                    AS reg_count,
  COALESCE(ca.cmnt_count, 0)                                                                        AS cmnt_count
FROM public.team_comp_plan_rel tcp
INNER JOIN public.comp_mst c
  ON c.comp_id = tcp.comp_id
 AND c.vers    = 0
 AND c.del_yn  = false
LEFT JOIN public.comp_evt_cfg ce
  ON ce.comp_id = c.comp_id
 AND ce.vers    = 0
 AND ce.del_yn  = false
LEFT JOIN public.comp_reg_rel cr
  ON cr.team_comp_id = tcp.team_comp_id
 AND cr.vers         = 0
 AND cr.del_yn       = false
LEFT JOIN public.comp_evt_cfg re
  ON re.comp_evt_id = cr.comp_evt_id
 AND re.vers        = 0
 AND re.del_yn      = false
LEFT JOIN cmnt_agg ca ON ca.comp_id = c.comp_id
WHERE tcp.team_id = p_team_id
  AND tcp.vers    = 0
  AND tcp.del_yn  = false
  AND (p_start IS NULL OR c.stt_dt >= p_start)
  AND (p_end   IS NULL OR c.stt_dt <= p_end)
GROUP BY
  c.comp_id, c.short_id, c.crt_by, c.ext_id, c.comp_sprt_cd, c.comp_nm,
  c.stt_dt, c.end_dt, c.loc_nm, c.src_url, ca.cmnt_count
ORDER BY c.stt_dt ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_team_competitions(uuid, date, date)
  TO anon, authenticated, service_role;
