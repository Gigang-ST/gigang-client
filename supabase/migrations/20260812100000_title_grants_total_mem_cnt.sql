-- 칭호획득 슬롯(v2)에 **고유 획득자 수**(total_mem_cnt)를 실어 준다.
--
-- 왜 필요한가: v2 지면은 칭호별 묶음이 아니라 **사람**이 단위다(대표 1명 + 나머지 명단
-- + `외 N명`). 그런데 `grants`는 칭호당 최신 10건에서 잘리므로(payload 상한 — 아래 함수
-- 주석) 클라이언트가 명단을 세어 만든 `외 N명`은 sweep 때 실제보다 **적게** 나온다.
-- 하필 sweep이 이 슬롯이 존재하는 이유라, 그때 숫자가 틀리면 계기가 거짓말을 한다.
-- 잘려도 총량은 보존한다는 `grant_cnt`의 원칙을 사람 축에도 그대로 적용한다.
--
-- 왜 배열 원소마다 같은 값을 싣는가: 이 RPC의 반환은 칭호 row 배열이라 스칼라 하나를
-- 얹을 자리가 없다. 반환을 `{titles: [...], total_mem_cnt: N}` 객체로 바꾸면 쿼리·타입·
-- 헬퍼·슬롯까지 줄줄이 따라오므로, **창 전체에서 상수인 값을 row마다 복사**하는 쪽을
-- 택했다(읽는 쪽은 `rows[0].total_mem_cnt` 하나만 본다). 값은 숫자 하나라 payload 영향 없음.
--
-- 나머지 규칙(30일 창·뉴비 제외·active만·만료 제외·칭호당 10건 상한·grant_cnt)은
-- 20260807100000_get_team_recent_title_grants.sql 그대로다.
CREATE OR REPLACE FUNCTION public.get_team_recent_title_grants(
  p_team_id uuid,
  p_days    integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT t.ttl_id, t.ttl_nm, t.ttl_desc, t.desc_visibility,
           mm.mem_id, mm.mem_nm, mm.avatar_url, mt.grnt_at,
           row_number() OVER (PARTITION BY t.ttl_id ORDER BY mt.grnt_at DESC) AS rn,
           count(*) OVER (PARTITION BY t.ttl_id) AS grant_cnt
    FROM public.mem_ttl_rel mt
    INNER JOIN public.ttl_mst t
      ON t.ttl_id = mt.ttl_id
     AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
    INNER JOIN public.team_mem_rel tm
      ON tm.team_mem_id = mt.team_mem_id
     AND tm.vers = 0 AND tm.del_yn = false AND tm.mem_st_cd = 'active'
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
    WHERE mt.team_id = p_team_id
      AND mt.vers = 0 AND mt.del_yn = false
      AND (mt.exp_at IS NULL OR mt.exp_at > now())
      AND mt.grnt_at >= now() - make_interval(days => GREATEST(p_days, 1))
      AND NOT COALESCE(
        t.cond_rule_json->>'type' = 'membership_days'
        AND (t.cond_rule_json->>'days')::int = 0,
        false
      )
  ),
  g AS (
    SELECT ttl_id, ttl_nm, ttl_desc, desc_visibility,
           max(grnt_at) AS last_grnt_at,
           max(grant_cnt) AS grant_cnt,
           jsonb_agg(jsonb_build_object(
             'mem_id',     mem_id,
             'mem_nm',     mem_nm,
             'avatar_url', avatar_url,
             'grnt_at',    grnt_at
           ) ORDER BY grnt_at DESC) FILTER (WHERE rn <= 10) AS grants
    FROM ranked
    GROUP BY ttl_id, ttl_nm, ttl_desc, desc_visibility
  ),
  -- 창 전체의 고유 획득자 수. `count(DISTINCT …) OVER ()`는 Postgres가 지원하지 않아
  -- (윈도우 함수에 DISTINCT 불가) 스칼라 서브쿼리로 뽑는다 — ranked는 이미 모든 필터를
  -- 통과한 (칭호 × 사람) 행이라 여기서 mem_id만 distinct로 세면 된다.
  m AS (
    SELECT count(DISTINCT mem_id) AS total_mem_cnt FROM ranked
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ttl_id',          g.ttl_id,
    'ttl_nm',          g.ttl_nm,
    'ttl_desc',        g.ttl_desc,
    'desc_visibility', g.desc_visibility,
    'last_grnt_at',    g.last_grnt_at,
    'grant_cnt',       g.grant_cnt,
    'total_mem_cnt',   m.total_mem_cnt,
    'grants',          g.grants
  ) ORDER BY g.last_grnt_at DESC), '[]'::jsonb)
  FROM g CROSS JOIN m;
$function$;

COMMENT ON FUNCTION public.get_team_recent_title_grants(uuid, integer) IS
  '전광판 칭호획득 슬롯 조회. 최근 N일(기본 30) 수여를 칭호별 묶음(획득자 최신순 상위 10건 + 전체 수여 건수 grant_cnt + 창 전체 고유 획득자 수 total_mem_cnt)으로. 뉴비(membership_days=0)·비활성 멤버·만료분 제외.';

-- CREATE OR REPLACE는 기존 권한을 유지하지만, 시그니처가 같더라도 명시해 두면
-- 이 파일만 단독으로 재적용해도 경계가 흔들리지 않는다(원본 마이그레이션과 같은 값).
REVOKE ALL ON FUNCTION public.get_team_recent_title_grants(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_recent_title_grants(uuid, integer)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
