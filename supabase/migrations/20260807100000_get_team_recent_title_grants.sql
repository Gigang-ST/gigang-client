-- 전광판 리드 "칭호획득" 슬롯 데이터 — 최근 N일(기본 30일) 수여를 **칭호별 묶음**으로 돌려준다.
--
-- get_team_story_feed에 CTE를 얹지 않는 이유: 이미 CTE 10개+로 운영 중이라 존을 얹을
-- 때마다 그 함수를 재배포하는 건 위험 대비 이득이 없다(get_team_posts·get_team_pledges와
-- 같은 분리 원칙). 캐시도 story-titles 태그로 따로 간다.
--
-- 필터 규칙(스펙 docs/superpowers/specs/2026-08-07-칭호획득-리드슬롯-design.md):
--  · 뉴비 제외 — 가입 즉시 전원 수여(membership_days=0)는 사건이 아니고, 새 얼굴
--    슬롯이 이미 그 소식을 전한다.
--  · active 멤버만 — 비활성·탈퇴자 얼굴이 지면에 오르면 안 된다(카드 RPC와 같은 경계).
--  · 만료·회수 제외 — vers=0, del_yn=false, exp_at 미래(또는 null)만.
--
-- 이펙트(badge_effect)는 싣지 않는다 — 이펙트는 칭호가 아니라 사람의 소유라
-- (team_mem_rel.selected_badge_effect) 여러 사람이 공유하는 칭호 나열에선 성립하지 않는다.
CREATE OR REPLACE FUNCTION public.get_team_recent_title_grants(
  p_team_id uuid,
  p_days    integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ttl_id',          g.ttl_id,
    'ttl_nm',          g.ttl_nm,
    'ttl_desc',        g.ttl_desc,
    'desc_visibility', g.desc_visibility,
    'last_grnt_at',    g.last_grnt_at,
    'grants',          g.grants
  ) ORDER BY g.last_grnt_at DESC), '[]'::jsonb)
  FROM (
    SELECT t.ttl_id, t.ttl_nm, t.ttl_desc, t.desc_visibility,
           max(mt.grnt_at) AS last_grnt_at,
           jsonb_agg(jsonb_build_object(
             'mem_id',     mm.mem_id,
             'mem_nm',     mm.mem_nm,
             'avatar_url', mm.avatar_url,
             'grnt_at',    mt.grnt_at
           ) ORDER BY mt.grnt_at DESC) AS grants
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
      -- 30일 창은 절대시각 비교(now() - interval)라 KST 날짜 경계 함정이 없다.
      AND mt.grnt_at >= now() - make_interval(days => GREATEST(p_days, 1))
      -- 뉴비 제외. cond_rule_json이 NULL인 수동 칭호가 NULL 전파로 통째로 걸러지지 않게
      -- COALESCE로 감싼다 — NOT(NULL) = NULL은 WHERE에서 false로 떨어진다.
      AND NOT COALESCE(
        t.cond_rule_json->>'type' = 'membership_days'
        AND (t.cond_rule_json->>'days')::int = 0,
        false
      )
    GROUP BY t.ttl_id, t.ttl_nm, t.ttl_desc, t.desc_visibility
  ) g;
$function$;

COMMENT ON FUNCTION public.get_team_recent_title_grants(uuid, integer) IS
  '전광판 칭호획득 슬롯 조회. 최근 N일(기본 30) 수여를 칭호별 묶음(획득자 최신순)으로. 뉴비(membership_days=0)·비활성 멤버·만료분 제외.';

-- SECURITY DEFINER 함수가 기본 PUBLIC EXECUTE로 열리지 않게 잠근다
-- (전광판 공개 조회라 anon까지는 허용 — get_team_posts와 같은 경계).
REVOKE ALL ON FUNCTION public.get_team_recent_title_grants(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_recent_title_grants(uuid, integer)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
