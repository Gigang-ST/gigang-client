-- v2 백필 P2 전용: public.member → public.team_mem_rel (기강 단일 팀)
-- 적용 순서: 20260404102201 직후, 20260404102309 이전
-- 기준: database-schema-v2-migration-map.md §3.1 B), §3.0
-- 선행: P1 완료(mem_mst 정본), team_mst gigang 정본(P0)
--
-- 정책: P1 과 동일하게 **auth.users 조인 없음**. `mem_mst` 정본이 있는 member 만 팀 소속으로 넣는다(FK).

CREATE OR REPLACE FUNCTION public.migration_v2_map_mem_st_cd(p_status public.member_status)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status::text
    WHEN 'active' THEN 'active'
    WHEN 'inactive' THEN 'inactive'
    WHEN 'pending' THEN 'pending'
    WHEN 'banned' THEN 'banned'
    WHEN 'left' THEN 'left'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.migration_v2_map_mem_st_cd(public.member_status) IS 'v2 백필: member.status → mem_st_cd (migration-map §3.1 B)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_mst
    WHERE team_cd = 'gigang'
      AND vers = 0
      AND del_yn = false
      AND team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION
      'team_mst gigang 정본이 없습니다. P0/20260404102200 먼저 적용하세요.';
  END IF;
END;
$$;

INSERT INTO public.team_mem_rel (
  team_id,
  mem_id,
  team_role_cd,
  mem_st_cd,
  join_dt,
  leave_dt,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  m.id,
  CASE WHEN m.admin THEN 'admin'::text ELSE 'member'::text END,
  coalesce(
    public.migration_v2_map_mem_st_cd(m.status),
    'pending'
  ),
  m.joined_at,
  NULL::date,
  0,
  false,
  m.created_at,
  coalesce(m.updated_at, m.created_at)
FROM public.member m
INNER JOIN public.mem_mst mm
  ON mm.mem_id = m.id
 AND mm.vers = 0
 AND mm.del_yn = false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.team_mem_rel t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.mem_id = m.id
    AND t.vers = 0
    AND t.del_yn = false
);

-- 팀당 owner 최소 1명 (migration-map §3.1·rollout §3.1 합의)
DO $$
DECLARE
  v_team constant uuid := 'c0ffee00-0000-4000-8000-000000000001'::uuid;
  n_owner integer;
  tid uuid;
BEGIN
  SELECT count(*) INTO n_owner
  FROM public.team_mem_rel
  WHERE team_id = v_team
    AND vers = 0
    AND del_yn = false
    AND team_role_cd = 'owner';

  IF n_owner = 0 THEN
    SELECT team_mem_id INTO tid
    FROM public.team_mem_rel
    WHERE team_id = v_team
      AND vers = 0
      AND del_yn = false
    ORDER BY CASE WHEN team_role_cd = 'admin' THEN 0 ELSE 1 END, crt_at
    LIMIT 1;

    IF tid IS NOT NULL THEN
      UPDATE public.team_mem_rel
      SET team_role_cd = 'owner', upd_at = now()
      WHERE team_mem_id = tid;
    END IF;
  END IF;
END;
$$;

DO $$
DECLARE
  n_member bigint;
  n_mem_mst bigint;
  n_rel bigint;
BEGIN
  SELECT count(*) INTO n_member FROM public.member;
  SELECT count(*) INTO n_mem_mst FROM public.mem_mst WHERE vers = 0 AND del_yn = false;
  SELECT count(*) INTO n_rel
  FROM public.team_mem_rel
  WHERE team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND vers = 0
    AND del_yn = false;

  RAISE NOTICE 'v2_backfill_p2: member_cnt=%, mem_mst_canonical=%, team_mem_rel_gigang=%', n_member, n_mem_mst, n_rel;
END;
$$;
